import { NextApiRequest, NextApiResponse } from "next";
import fs from "fs/promises"
import types from "../../../../types.json"
import prettyBytes from "pretty-bytes";
import dayjs from "dayjs";
import jwt from "jsonwebtoken"
import { authorized, transactions, mappings } from "../../../../mongodb";
import getFolderSize from "get-folder-size"
import { createReadStream, createWriteStream } from "fs";
import crypto from "crypto"
import bcrypt from "bcrypt"
import { Readable } from "stream";

let { bucket } = process.env

function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  


export default async function handler(req: NextApiRequest, res: NextApiResponse,) {
    let user = ""
    let specifiedPath = ""
    try {
        user = jwt.verify(req.cookies.token as string, process.env.jwtToken as string) as string
    } catch (_) { }
    if(req.url == "/api/bucket/ping") {
        const size = await getFolderSize.loose(bucket as string)
        let total = 250 // in gigs
        return res.status(200).send({user, total, used: JSON.parse((size / 1000 / 1000 / 1000).toFixed(5))})
    }
    if (!req.query.path || !["dir", "file"].includes((req.query.path[0]))) return res.status(403).send({ error: "403 FORBIDDEN", message: "Could not find the URL and method provided." })
    if(req.method == "GET") {
        let path = req.query.path[1] ? await mappings.findOne({url: "/" + (req.query.path[1] || "")}) : {
            path: ""
        }
        if(!path) return res.status(400).send({ error: "400 BAD REQUEST", message: "Could not find the corresponding object." })
        specifiedPath = path.path
    }
    if(user !== "root" && req.method !== "GET")  {
        let valid = await authorized.exists({
            $expr: {
                $cond: {
                    'if': {
                        $and: [{ $eq: ['$username', user] }, {
                            $not: [
                                {
                                    $in: ["/" + (req.query.path as string[]).slice(1).join("/"), "$writeAccessTo"]
                                }
                            ]
                        }, {
                            $ne: [{
                                $size: [{
                                    $filter: {
                                        input: "$writeAccessTo",
                                        as: "item",
                                        cond: { $in: ["$$item", ["", ...(req.query.path as string[]).slice(1)].map((e, i, a) => a.slice(0, i+1).join("/") || "/")] }
                                    }
                                }]
                            }, 0]
                        }]
                    }, then: true, 'else': false
                }
            }
        })
        if (!valid) return res.status(401).send({ error: "401 UNAUTHORIZED", message: "You are not authorized to use the following route." })

    }
    if ((req.query.path as string[])[0] == "dir") {
        (req.query.path as string[]).shift()
        switch (req.method) {
            case "GET":
                try {
                    if ((req.query.path as string[]).length > 1) return res.status(400).send({ error: "400 BAD REQUEST", message: "Please enter an object ID to view!" })
                    let files: any[] = await fs.readdir(bucket as string + specifiedPath)
                    let editable = user === "root" || await authorized.exists({
                        $expr: {
                            $cond: {
                                'if': {
                                    $and: [{ $eq: ['$username', user] }, {
                                        $in: [specifiedPath, "$writeAccessTo"]
                                    }]
                                }, then: true, 'else': false
                            }
                        }
                    })
                    files = files.map(async e => {
                        let stat = await fs.lstat(bucket as string + specifiedPath + "/" + e)
                        let isDir = stat.isDirectory()
                        let viewable = user == "root" ? false : await authorized.exists({
                            $expr: {
                                $cond: {
                                    'if': {
                                        $and: [{ $ne: ['$username', user] }, {
                                            $in: ["/" + e, "$hasAccessTo"]
                                        }]
                                    }, then: true, 'else': false
                                }
                            }
                        })
                        return {
                            name: !isDir ? e.split(".").slice(0, e.split(".").length-1).join(".") : e,
                            type: !isDir ? e.split(".").at(-1) : undefined,
                            isDir,
                            authorized: !viewable,
                            url: (await mappings.findOne({path: specifiedPath + "/" + e})).url,
                            path: specifiedPath + "/" + e,
                            mime: !isDir ? (types as any)["." + e.split(".").at(-1)] || "application/octet-stream" : undefined,
                            size: prettyBytes(stat.size),
                            modified: dayjs(stat.mtimeMs).format("MMMM DD, YYYY hh:mm:ss A")
                        }
                    })
                    files = await Promise.all(files)
                    files = files.filter(e => e.authorized)
                    files.sort((a, b) => b.isDir - a.isDir)
                    let valid = user == "root" ? false : await authorized.exists({
                        $expr: {
                            $cond: {
                                'if': {
                                    $and: [{ $ne: ['$username', user] }, {
                                        $ne: [{
                                            $size: [{
                                                $filter: {
                                                    input: "$hasAccessTo",
                                                    as: "item",
                                                    cond: { $in: ["$$item", ["", ...specifiedPath.split("/")].slice(1).map((e: any, i: any, a: any) => a.slice(0, i+1).join("/") || "/")] }
                                                }
                                            }]
                                        }, 0]
                                    }]
                                }, then: true, 'else': false
                            }
                        }
                    })
                    let previousPaths = !valid ? await Promise.all(specifiedPath.split("/").slice(1).map(async (e, i, a) => {
                        let path = a.slice(0, i+1).join("/") || ""
                        return (await mappings.findOne({path: "/" + path})).url
                    })) : req.query.path[0] ? ["/" + req.query.path[0]] : [] 
                    return res.status(200).send({files, editable, path: !valid ? (specifiedPath || "/") : "/" + specifiedPath.split("/").at(-1), previousPaths: ["/", ...previousPaths], hasVisibleAccess: !valid})
                } catch (e) {
                    console.log(e)
                    return res.status(404).send({ error: "404 NOT FOUND", message: "Could not find the group requested" })
                }
            case "POST":
                try {
                    if ((req.query.path as string[]).length == 0) return res.status(400).send({ error: "400 BAD REQUEST", message: "Please enter a group name to create!" })
                    let existing = await mappings.findOne({path: "/" + (req.query.path as string[]).join("/")})
                    if(existing?.directory == true) return res.status(400).send({ error: "400 BAD REQUEST", message: "That group already exists!", type: "OverwriteErr"})
                    if(existing?.directory == false) return res.status(400).send({ error: "400 BAD REQUEST", message: `That group is of type "${existing.directory ? "Folder" : "File"}" meaning it cannot be overwritten!`})
                    if(req.query.overwrite) {
                        await fs.mkdir(bucket as string + "/" + (req.query.path as string[]).join("/"), {recursive: true})
                    } else {
                        await fs.mkdir(bucket as string + "/" + (req.query.path as string[]).join("/"))
                    }
                    let url = crypto.generateKeySync("hmac", {length: 48}).export().toString("hex")
                    while(true) {
                        let exists = await mappings.exists({url: "/" + url})
                        if(!exists) break;
                        url = crypto.generateKeySync("hmac", {length: 48}).export().toString("hex")
                    }
                    await mappings.updateOne({path: "/" + (req.query.path as string[]).join("/")}, {
                        $set: {
                            path: "/" + (req.query.path as string[]).join("/"),
                            url: "/" + url,
                            directory: true
                        }
                    }, {upsert: true})
                    return res.status(204).send(null)
                } catch (_) {
                    return res.status(400).send({ error: "400 BAD REQUEST", message: "That group name has a corresponding file name!", type: "OverwriteErr"})
                }
            case "PATCH":
                try {
                    if ((req.query.path as string[]).length == 0) return res.status(400).send({ error: "400 BAD REQUEST", message: "Please enter an object name to rename!" })
                    let existing = await mappings.findOne({path: "/" + (req.query.path as string[]).join("/")})
                    if(!existing) return res.status(400).send({ error: "404 NOT FOUND", message: "Could not find the object being requested to edit." })
                    let valid = user == "root" ? true : await authorized.exists({
                        $expr: {
                            $cond: {
                                'if': {
                                    $and: [{ $eq: ['$username', user] }, {
                                        $not: [
                                            {
                                                $in: [req.body.newDir, "$writeAccessTo"]
                                            }
                                        ]
                                    }, {
                                        $ne: [{
                                            $size: [{
                                                $filter: {
                                                    input: "$writeAccessTo",
                                                    as: "item",
                                                    cond: { $in: ["$$item", ["", ...(req.body.newDir as string).split("/").slice(1)].map((e, i, a) => a.slice(0, i+1).join("/") || "/")] }
                                                }
                                            }]
                                        }, 0]
                                    }]
                                }, then: true, 'else': false
                            }
                        }
                    })
                    if (!valid) return res.status(401).send({ error: "401 UNAUTHORIZED", message: "You are not authorized to move the object to the following path." })
                    let exists = await mappings.findOne({path: req.body.newDir})
                        if(exists !== null && exists?.directory == existing.directory) return res.status(403).send({error: "403 FORBIDDEN", message: "That new object directory already exists. Pass the overwriteGroup param to try and overwrite it.", type: "GroupOverwriteErr"})
                        if(exists !== null  && exists?.directory !== existing.directory) return res.status(403).send({error: "403 FORBIDDEN", message: `That new object directory is of type "${exists.directory ? "Folder" : "File"}", meaning you cannot overwrite it!`})
                    if(req.query.overwrite) {
                        await transactions.updateMany({path: new RegExp("/" + escapeRegExp((req.query.path as string[]).join("/")) + "($|/)")}, [{
                            $set: {
                                path: {
                                    $replaceOne: {
                                        input: "$path",
                                        find: "/" + (req.query.path as string[]).join("/"),
                                        replacement: req.body.newDir
                                    }
                                }
                            }
                        }])
                    } else {
                        let exists = await transactions.find({path: new RegExp("/" + escapeRegExp((req.query.path as string[]).join("/")) + "($|/)")})
                        if(exists.length) return res.status(403).send({error: "403 FORBIDDEN", message: "The object name you are editing currently has uploading objects associated with it. If you want to overwrite them, input it in the query params.", type: "TransactionOverwriteErr", affectedFiles: exists.map(e => e.path)})
                    }
                    if(req.query.overwriteGroup) {await mappings.deleteOne({path: req.body.newDir})};
                    await fs.rename(bucket as string + "/" + (req.query.path as string[]).join("/"), bucket as string + req.body.newDir)
                    await mappings.updateMany({path: new RegExp("/" + escapeRegExp((req.query.path as string[]).join("/")) + "($|/)")}, [{
                        $set: {
                            path: {
                                $replaceOne: {
                                    input: "$path",
                                    find: "/" + (req.query.path as string[]).join("/"),
                                    replacement: req.body.newDir
                                }
                            }
                        }
                    }])
                    return res.status(204).send(null)
                } catch (_) {
                    return res.status(400).send({ error: "404 NOT FOUND", message: "Could not find the object being requested to edit." })
                }
            case "DELETE":
                try {
                    if ((req.query.path as string[]).length == 0) return res.status(400).send({ error: "400 BAD REQUEST", message: "Please enter a group name to delete!" })
                    let existing = await mappings.exists({path: "/" + (req.query.path as string[]).join("/"), directory: true})
                    if(!existing) return res.status(400).send({ error: "404 NOT FOUND", message: "Could not find the object being requested to delete." })
                    if(req.query.overwrite) {
                        await transactions.deleteMany({path: new RegExp("/" + escapeRegExp((req.query.path as string[]).join("/")) + "($|/)")})
                    } else {
                        let exists = await transactions.find({path: new RegExp("/" + escapeRegExp((req.query.path as string[]).join("/")) + "($|/)")})
                        if(exists.length) return res.status(403).send({error: "403 FORBIDDEN", message: "The object name you are deleting currently has uploading objects associated with it. If you want to overwrite them, input it in the query params.", type: "OverwriteErr", affectedFiles: exists.map(e => e.path)})
                    }
                    await fs.rm(bucket as string + "/" + (req.query.path as string[]).join("/"), { recursive: true, force: true })
                    await mappings.deleteMany({path: new RegExp("/" + escapeRegExp((req.query.path as string[]).join("/")) + "($|/)")})
                    return res.status(204).send(null)
                } catch (_) {
                    console.log(_)
                    return res.status(400).send({ error: "404 NOT FOUND", message: "Could not find the object being requested to delete." })
                }
        }
    }

    if ((req.query.path as string[])[0] == "file") {
        (req.query.path as string[]).shift()
        switch (req.method) {
            case "GET":
                try {
                    if ((req.query.path as string[]).length != 1) return res.status(400).send({ error: "400 BAD REQUEST", message: "Please enter an object ID to view!" })
                    let stat = await fs.lstat(bucket as string + specifiedPath)
                    
                    if(stat.isDirectory()) throw new Error()
                    if (!req.query.download) {
                        res.setHeader("content-disposition", `inline; filename="${specifiedPath.split("/").at(-1)}"`);
                        res.setHeader("accept-ranges", "bytes");
                        let str = "." + specifiedPath.split("/").at(-1)?.split(".").at(-1) || "a"
                        res.setHeader("Content-Type", (types as any)[str]);
                    } else {
                        res.setHeader("content-disposition", `attachment; filename="${specifiedPath.split("/").at(-1)}"`);
                    }
                    res.writeHead(200, {
                        'content-length': stat.size
                    })
                    const file = await fs.readFile(bucket as string + specifiedPath)
                    const stream = new Readable()
                    stream._read = () => {}
                    for(let i = 0; i < file.length; i += 8000000) {
                        stream.push(file.subarray(i, i+8000000))
                    }
                    await new Promise((resolve, reject) => {
                        stream.pipe(res)
                        stream.on("end", resolve)
                    })
                    return res.end()
                } catch (_) {
                    console.log(_)
                    return res.status(404).send({ error: "404 NOT FOUND", message: "Could not find the object requested" })
                }
            case "POST":
                try {
                    if ((req.query.path as string[]).length == 0) return res.status(400).send({ error: "400 BAD REQUEST", message: "Please enter a file name to add!" })
                    if(req.body.length > 8000000) return res.json({error: "400 BAD REQUEST", message: "Max chunks allowed to be sent in are 16 MB!"})
                    if(!req.query.overwrite) {
                    let tExists = await transactions.findOne({path: "/" + (req.query.path as string[]).join("/")})
                    if(tExists) {
                        try {
                            let isAuthorized = await bcrypt.compare(req.headers["x-secret-token"] as any, tExists.cryptoKey as any)
                            if(!isAuthorized) throw new Error("")
                        } catch(_) {
                            return res.status(401).send({ error: "401 UNAUTHORIZED", message: "Not a valid token for said path.", type: "InvalidTokenErr" })
                        }
                        if(req.body == "END") {
                            await transactions.deleteOne({path: "/" + (req.query.path as string[]).join("/")})
                            return res.status(204).send(null)
                        }
                        if(req.body == "CANCEL") {
                            await transactions.deleteOne({path: "/" + (req.query.path as string[]).join("/")})
                            await mappings.deleteOne({path: "/" + (req.query.path as string[]).join("/")})
                            await fs.rm(bucket as string + "/" + (req.query.path as string[]).join("/")).catch((e) => {
                                console.log(e)
                                return res.status(400).send({ error: "400 BAD REQUEST", message: "This group does not exists!" })
                            })
                            return res.status(204).send(null)
                        }
                        try {
                            let buffer = Buffer.from(req.body);
                            await fs.appendFile(bucket as string + "/" + (req.query.path as string[]).join("/"), buffer)
                        } catch(_) {
                            return res.status(400).send({ error: "400 BAD REQUEST", message: "This group does not exists!" })
                        }
                        return res.status(201).send(null)
                    }
                }
                let alreadyCreated =  await mappings.findOne({path: "/" + (req.query.path as string[]).join("/")})
                if(alreadyCreated?.directory == false)  return res.status(401).send({ error: "400 BAD REQUEST", message: "File already exists. If you want to overwrite, add the overwrite query param.", type: "OverwriteErr" })
                if(alreadyCreated?.directory == true)  return res.status(401).send({ error: "400 BAD REQUEST", message: "Folder with the same name already exists"})
                    let buffer = Buffer.from(req.body);
                    await fs.writeFile(bucket as string + "/" + (req.query.path as string[]).join("/"),  buffer).catch((e) => {
                        console.log(e)
                        return res.status(400).send({ error: "400 BAD REQUEST", message: "This group does not exists!" })
                    })
                    let url = crypto.generateKeySync("hmac", {length: 48}).export().toString("hex")
                    while(true) {
                        let exists = await mappings.exists({url: "/" + url})
                        if(!exists) break;
                        url = crypto.generateKeySync("hmac", {length: 48}).export().toString("hex")
                    }
                            await mappings.updateOne({path: "/" + (req.query.path as string[]).join("/")}, {
                                $set: {
                                    path: "/" + (req.query.path as string[]).join("/"),
                                    url: "/" + url,
                                    directory: false
                                }
                            }, {upsert: true})
                    let key = crypto.generateKeySync("hmac", {length: 128}).export().toString("hex")
                    let cryptoKey = await bcrypt.hash(key, 10)
                    await transactions.updateOne({path: "/" + (req.query.path as string[]).join("/")}, {
                        $set: {
                            cryptoKey
                        }
                    }, {upsert: true})
                    return res.status(201).send({key})
                } catch (e) {
                    console.log(e)
                    return res.status(400).send({ error: "400 BAD REQUEST", message: "Make sure your body is an array of numbered ascii chars!" })
                }
            case "DELETE":
                try {
                    if ((req.query.path as string[]).length == 0) return res.status(400).send({ error: "400 BAD REQUEST", message: "Please enter a file name to delete!" })
                    let existing = await mappings.exists({path: "/" + (req.query.path as string[]).join("/"), directory: false})
                    if(!existing) return res.status(400).send({ error: "404 NOT FOUND", message: "Could not find the object being requested to delete." })
                    if(req.query.overwrite) {
                        await transactions.deleteMany({path: "/" + (req.query.path as string[]).join("/")})
                    } else {
                        let exists = await transactions.find({path: "/" + (req.query.path as string[]).join("/")})
                        if(exists.length) return res.status(403).send({error: "403 FORBIDDEN", message: "The object name you are deleting currently has uploading objects associated with it. If you want to overwrite them, input it in the query params.", type: "OverwriteErr", affectedFiles: exists.map(e => e.path)})
                    }
                    await fs.rm(bucket as string + "/" + (req.query.path as string[]).join("/"))
                    await mappings.deleteOne({path: "/" + (req.query.path as string[]).join("/")})
                    return res.status(204).send(null)
                } catch (_) {
                    return res.status(400).send({ error: "404 NOT FOUND", message: "Could not find the object being requested to delete." })
                }
        }
    }
}

export const config = {
    api: {
      bodyParser: {
        sizeLimit: '100gb',
      },
      responseLimit: false
    },
  }