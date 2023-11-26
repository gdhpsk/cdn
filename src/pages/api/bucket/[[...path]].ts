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

let { bucket } = process.env

function escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  


export default async function handler(req: NextApiRequest, res: NextApiResponse,) {
    res.setHeader("Access-Control-Allow-Origin", "*")
    let user = ""
    try {
        user = jwt.verify(req.cookies.token as string, process.env.jwtToken as string) as string
    } catch (_) { }
    if(req.url == "/api/bucket/ping") {
        const size = await getFolderSize.loose(bucket as string)
        let total = 250 // in gigs
        return res.status(200).send({user, total, used: JSON.parse((size / 1000 / 1000 / 1000).toFixed(5))})
    }
    if (!req.query.path || !["dir", "file"].includes((req.query.path[0]))) return res.status(400).send({ error: "400 BAD REQUEST", message: "Could not find the URL and method provided." })
        if(req.query.path.length > 2) return res.status(400).send({ error: "400 BAD REQUEST", message: "Too many query parameters" })
        let specifiedPath = await mappings.findOne({url: "/" + (req.query.path[1] || "")})
        if(!specifiedPath) return res.status(400).send({ error: "400 BAD REQUEST", message: "Could not find the corresponding object." })
    if(user !== "root" && req.method !== "GET")  {
        let valid = await authorized.exists({
            $expr: {
                $cond: {
                    'if': {
                        $and: [{ $eq: ['$username', user] }, {
                            $ne: [{
                                $size: [{
                                    $filter: {
                                        input: "$writeAccessTo",
                                        as: "item",
                                        cond: { $in: ["$$item", specifiedPath.path.split("/").map((e: any, i: any, a: any) => a.slice(0, i+1).join("/") || "/")] }
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
                    let files: any[] = await fs.readdir(bucket as string + specifiedPath.path)
                    let editable = user === "root" || await authorized.exists({
                        $expr: {
                            $cond: {
                                'if': {
                                    $and: [{ $eq: ['$username', user] }, {
                                        $in: [specifiedPath.path, "$writeAccessTo"]
                                    }]
                                }, then: true, 'else': false
                            }
                        }
                    })
                    let aggregate = await mappings.aggregate([{
                        $match: {
                            path: {$in: files.map(e => specifiedPath.path + "/" + e)}
                        }
                    },
                    {
                         $lookup: {
                            from: "authorizeds",
                            let: {path: "$path"},
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $cond: {
                                                'if': {
                                                    $and: [{ $ne: ['$username', user] }, {
                                                        $in: ["$$path", "$hasAccessTo"]
                                                    }]
                                                }, then: true, 'else': false
                                            }
                                        }
                                    }
                                }
                            ],
                            as: "viewable"
                         }             
                    },
                    {
                        $project: {
                            url: 1,
                            path: 1,
                            name: 1,
                            viewable: {
                                $cond: {
                                    'if': {
                                       $and: [
                                        {$ne: [user, "root"]},
                                        { $ne: [{$size: "$viewable"}, 0]}
                                       ]
                                    }, 
                                    then: false, 
                                    else: true
                            },
                        }
                    }
                }
                ])
                    files = files.map(async e => {
                        let stat = await fs.lstat(bucket as string + specifiedPath.path + "/" + e)
                        let extras = aggregate.find(x => x.path == specifiedPath.path + "/" + e)
                        let isDir = stat.isDirectory()
                        let {viewable, url, name} =extras
                        return {
                            name: !isDir && name.indexOf(".") != -1 ? name.split(".").slice(0, name.split(".").length-1).join(".") : name,
                            type: !isDir ? name.split(".").at(-1) : undefined,
                            isDir,
                            authorized: viewable,
                            url,
                            path: specifiedPath.path + "/" + e,
                            mime: !isDir ? (types as any)["." + name.split(".").at(-1).toLowerCase()] || "application/octet-stream" : undefined,
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
                                                    cond: { $in: ["$$item", specifiedPath.path.split("/").map((e: any, i: any, a: any) => a.slice(0, i+1).join("/") || "/")] }
                                                }
                                            }]
                                        }, 0]
                                    }]
                                }, then: true, 'else': false
                            }
                        }
                    })
                    let previousPaths = !valid ? await Promise.all(specifiedPath.path.split("/").slice(1).map(async (e: any, i: any, a: any) => {
                        let path = a.slice(0, i+1).join("/") || ""
                        return (await mappings.findOne({path: "/" + path})).url
                    })) : req.query.path[0] ? ["/" + req.query.path[0]] : [] 
                    return res.status(200).json({files, editable, path: !valid ? specifiedPath.virtualPath : ["/", ...(req.query.path[0] ? [specifiedPath.virtualPath.at(-1)] : [])], previousPaths: ["/", ...previousPaths], hasVisibleAccess: !valid})
                } catch (e) {
                    console.log(e)
                    return res.status(404).json({ error: "404 NOT FOUND", message: "Could not find the group requested" })
                }
            case "POST":
                try {
                    if (!req.body.name || !specifiedPath.directory) return res.status(400).send({ error: "400 BAD REQUEST", message: "Please enter an object name!" })
                    let existing =  await mappings.findOne({virtualPath: specifiedPath.virtualPath, name: req.body.name, directory: false}) || await mappings.findOne({virtualPath: [...specifiedPath.virtualPath, req.body.name], directory: true})
                    if(!req.query.overwrite && existing?.directory == true) return res.status(400).send({ error: "400 BAD REQUEST", message: "That group already exists!", type: "OverwriteErr"})
                    if(existing?.directory == false) return res.status(400).json({ error: "400 BAD REQUEST", message: `That group is of type "${existing.directory ? "Folder" : "File"}" meaning it cannot be overwritten!`})
                    let url = crypto.generateKeySync("hmac", {length: 48}).export().toString("hex")
                    while(true) {
                        let exists = await mappings.exists({url: "/" + url})
                        if(!exists) break;
                        url = crypto.generateKeySync("hmac", {length: 48}).export().toString("hex")
                    }
                    if(req.query.overwrite && existing) {
                        await fs.rm(bucket as string + existing.path, {recursive: true, force: true})
                        await mappings.deleteMany({path: {$regex: new RegExp(existing.path), $ne: existing.path}})
                        await fs.mkdir(bucket as string + existing.path, {recursive: true})
                    } else {
                        await fs.mkdir(bucket as string + specifiedPath.path + "/" + url)
                    }
                    let name = existing ? existing.name : req.body.name
                    await mappings.updateOne({path: existing ? existing.path : specifiedPath.path + "/" + url}, {
                        $setOnInsert: {
                            path: specifiedPath.path + "/" + url,
                            virtualPath: [...specifiedPath.virtualPath, name],
                            name: req.body.name,
                            url: "/" + url,
                            directory: true
                        }
                    }, {upsert: true})
                    return res.status(201).send({hash: url})
                } catch (_) {
                    console.log(_)
                    return res.status(400).send({ error: "400 BAD REQUEST", message: "That group name has a corresponding file name!"})
                }
            case "PATCH":
                try {
                    if ((req.query.path as string[]).length == 0) return res.status(400).send({ error: "400 BAD REQUEST", message: "Please enter an object name to rename!" })
                    let existing = await mappings.findOne({virtualPath: req.body.newDir, directory: true})
                    if(!existing) return res.status(400).send({ error: "400 BAD REQUEST", message: "Could not find new path." })
                    let valid = user == "root" ? true : await authorized.exists({
                        $expr: {
                            $cond: {
                                'if': {
                                    $and: [{ $eq: ['$username', user] }, {
                                        $not: [
                                            {
                                                $in: [existing.path, "$writeAccessTo"]
                                            }
                                        ]
                                    }, {
                                        $ne: [{
                                            $size: [{
                                                $filter: {
                                                    input: "$writeAccessTo",
                                                    as: "item",
                                                    cond: { $in: ["$$item", [existing.path.split("/").slice(1)].map((e, i, a) => a.slice(0, i+1).join("/") || "/")] }
                                                }
                                            }]
                                        }, 0]
                                    }]
                                }, then: true, 'else': false
                            }
                        }
                    })
                    if (!valid) return res.status(401).send({ error: "401 UNAUTHORIZED", message: "You are not authorized to move the object to the following path." })
                    if(req.query.overwrite) {
                        await transactions.deleteMany({path: new RegExp(existing.path + "/" + req.query.path[0] + "($|/)")})
                    } else {
                        let exists = await transactions.find({path: new RegExp(existing.path + "/" + req.query.path[0] + "($|/)")})
                        if(exists.length) return res.status(403).send({error: "403 FORBIDDEN", message: "The object name you are editing currently has uploading objects associated with it.", type: "TransactionOverwriteErr", affectedFiles: await Promise.all(exists.map(async e => {
                            let mapping = await mappings.findOne({path: e.path})
                            return [...(mapping?.virtualPath || []), mapping?.name]
                        }))})
                    }
                    let exists = specifiedPath.directory ? (await mappings.findOne({virtualPath: existing.virtualPath, name: req.body.newName, url: {$ne: "/" + req.query.path[0]}}) || await mappings.findOne({virtualPath: [...existing.virtualPath, req.body.newName], url: {$ne: "/" + req.query.path[0]}})) : (await mappings.findOne({virtualPath: [...existing.virtualPath, req.body.newName], url: {$ne: "/" + req.query.path[0]}}) || await mappings.findOne({virtualPath: existing.virtualPath, name: req.body.newName, url: {$ne: "/" + req.query.path[0]}}))
                        if(!req.query.overwriteGroup && exists !== null && exists?.directory == specifiedPath.directory) return res.status(403).send({error: "403 FORBIDDEN", message: "That new object directory already exists. Pass the overwriteGroup param to try and overwrite it.", type: "GroupOverwriteErr"})
                        if(exists !== null  && exists?.directory !== specifiedPath.directory) return res.status(403).send({error: "403 FORBIDDEN", message: `That new object directory is of type "${exists.directory ? "Folder" : "File"}", meaning you cannot overwrite it!`})
                    if(req.query.overwriteGroup) {
                        let deletedObj =  specifiedPath.directory ? await mappings.findOneAndDelete({virtualPath: [...existing.virtualPath, req.body.newName], url: {$ne: "/" + req.query.path[0]}}) : await mappings.findOneAndDelete({virtualPath: existing.virtualPath, name: req.body.newName, url: {$ne: "/" + req.query.path[0]}})
                        try {
                            await fs.rm(bucket as string + deletedObj.path, {recursive: true, force: true})
                        } catch(_) {}
                    };
                    await fs.rename(bucket as string + specifiedPath.path, bucket as string + existing.path + "/" + req.query.path[0])
                    await mappings.updateMany({path: {$regex: new RegExp(specifiedPath.path), $ne: specifiedPath.path}}, [{
                        $set: {
                            path: {
                                $replaceOne: {
                                    input: "$path",
                                    find: specifiedPath.path.split("/").slice(0, -1).join("/"),
                                    replacement: existing.path
                                }
                            },
                            virtualPath: {
                                $concatArrays: [req.body.newDir, [req.body.newName], {
                                    $slice: ["$virtualPath", specifiedPath.virtualPath.length, 10000]
                                }]
                            }
                        }
                    }])
                    await mappings.updateOne({path: specifiedPath.path}, [{
                        $set: {
                            path: {
                                $replaceOne: {
                                    input: "$path",
                                    find: specifiedPath.path.split("/").slice(0, -1).join("/"),
                                    replacement: existing.path
                                }
                            },
                            virtualPath: [...req.body.newDir, ...(specifiedPath.directory ? [req.body.newName] : [])],
                            name: req.body.newName
                        }
                    }])
                    return res.status(204).send(null)
                } catch (_) {
                    console.log(_)
                    return res.status(400).send({ error: "404 NOT FOUND", message: "Could not find the object being requested to edit." })
                }
            case "DELETE":
                try {
                    if ((req.query.path as string[]).length == 0 || !specifiedPath.directory) return res.status(400).send({ error: "400 BAD REQUEST", message: "Please enter an object name to delete!" })
                    if(req.query.overwrite) {
                        await transactions.deleteMany({path: new RegExp("/" + req.query.path[0] + "($|/)")})
                    } else {
                        let exists = await transactions.find({path: new RegExp("/" + req.query.path[0] + "($|/)")})
                        if(exists.length) return res.status(403).send({error: "403 FORBIDDEN", message: "The object name you are deleting currently has uploading objects associated with it. If you want to overwrite them, input it in the query params.", type: "OverwriteErr", affectedFiles: await Promise.all(exists.map(async e => {
                            let mapping = await mappings.findOne({path: e.path})
                            return [...(mapping?.virtualPath || []), mapping?.name]
                        }))})
                    }
                    await fs.rm(bucket as string + specifiedPath.path, { recursive: true, force: true })
                    await mappings.deleteMany({path: new RegExp("^" + specifiedPath.path + "($|/)")})
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
                    if ((req.query.path as string[]).length != 1) return res.status(400).send({ error: "400 BAD REQUEST", message: "Please enter ab object hash to view!" })
                    let stat = await fs.lstat(bucket as string + specifiedPath.path)
                    
                    if(stat.isDirectory()) throw new Error()
                    let str = "." + specifiedPath.name.split(".").at(-1)?.toLowerCase() || "bin"
                    let c_size = 8000000
                    let start = parseInt(req.headers.range?.split("=")?.[1] || "0")
                    let end = stat.size
                    if(req.headers.range) {
                        end = c_size + start > stat.size ? stat.size : c_size + start
                        res.setHeader("Content-Range", `bytes ${start}-${end-1}/${stat.size}`)
                    } else {
                        res.setHeader("Content-Disposition", `${req.query.download ? "attachment" : "inline"}; filename="${req.query.name ? req.query.name + "." + specifiedPath.name.split(".").at(-1) : specifiedPath.name}"`)
                    }
                    res.writeHead(req.headers.range ? 206 : 200, {
                        'content-length': end - start,
                        'accept-ranges': 'bytes',
                        'content-type': (types as any)[str] || "application/octet-stream"
                    })
                    const file = createReadStream(bucket as string + specifiedPath.path, {highWaterMark: c_size, start, end})
                    file.on("data", (chunk) => res.write(chunk))
                    file.on("end", () => res.end())
                    break;
                } catch (_) {
                    console.log(_)
                    return res.status(404).send({ error: "404 NOT FOUND", message: "Could not find the object requested" })
                }
            case "POST":
                try {
                    if (!req.query.name || !specifiedPath.directory) return res.status(400).send({ error: "400 BAD REQUEST", message: "Please enter an object name in query params!" })
                    if(req.body.length > 8000000) return res.json({error: "400 BAD REQUEST", message: "Max chunks allowed to be sent in are 16 MB!"})
                    if(!req.query.overwrite) {
                        let alreadyCreated =  await mappings.findOne({virtualPath: specifiedPath.virtualPath, name: req.query.name})
                    let tExists = await transactions.findOne({path: specifiedPath.path + alreadyCreated?.url || ""})
                    if(tExists) {
                        try {
                            let isAuthorized = await bcrypt.compare(req.headers["x-secret-token"] as any, tExists.cryptoKey as any)
                            if(!isAuthorized) throw new Error("")
                        } catch(_) {
                            return res.status(401).send({ error: "401 UNAUTHORIZED", message: "Not a valid token for said path.", type: "InvalidTokenErr" })
                        }
                        if(req.body == "END") {
                            await transactions.deleteOne({path: alreadyCreated.path})
                            return res.status(201).send({hash: alreadyCreated.url.split("/")[1]})
                        }
                        if(req.body == "CANCEL") {
                            await transactions.deleteOne({path: alreadyCreated.path})
                            await mappings.deleteOne({path: alreadyCreated.path})
                            await fs.rm(bucket as string + alreadyCreated.path).catch((e) => {
                                console.log(e)
                                return res.status(400).send({ error: "400 BAD REQUEST", message: "This group does not exists!" })
                            })
                            return res.status(204).send(null)
                        }
                        try {
                            let buffer = Buffer.from(req.body);
                            await fs.appendFile(bucket as string + alreadyCreated.path, buffer)
                        } catch(_) {
                            return res.status(400).send({ error: "400 BAD REQUEST", message: "This group does not exists!" })
                        }
                        return res.status(201).send(null)
                    }
                }
                let alreadyCreated = await mappings.findOne({virtualPath: [...specifiedPath.virtualPath, req.query.name], directory: true}) || await mappings.findOne({virtualPath: specifiedPath.virtualPath, name: req.query.name, directory: false})
                if(!req.query.overwrite && alreadyCreated?.directory == false)  return res.status(400).send({ error: "400 BAD REQUEST", message: "File already exists. If you want to overwrite, add the overwrite query param.", type: "OverwriteErr" })
                if(alreadyCreated?.directory == true)  return res.status(400).send({ error: "400 BAD REQUEST", message: "Folder with the same name already exists"})
                
                let url = ""
                if(!alreadyCreated) {
                    url = crypto.generateKeySync("hmac", {length: 48}).export().toString("hex")
                while(true) {
                    let exists = await mappings.exists({url: "/" + url})
                    if(!exists) break;
                    url = crypto.generateKeySync("hmac", {length: 48}).export().toString("hex")
                }
                }
                    let buffer = Buffer.from(req.body);
                    await fs.writeFile(bucket as string + specifiedPath.path + (alreadyCreated ? alreadyCreated.url : "/" + url) ,  buffer).catch((e) => {
                        console.log(e)
                        return res.status(400).send({ error: "400 BAD REQUEST", message: "This group does not exists!" })
                    })
                            await mappings.updateOne({path: specifiedPath.path + (alreadyCreated ? alreadyCreated.url : "/" + url)}, {
                                $setOnInsert: {
                                    path: specifiedPath.path + "/" + url,
                                    url: "/" + url,
                                    virtualPath: specifiedPath.virtualPath,
                                    name: req.query.name,
                                    directory: false
                                }
                            }, {upsert: true})
                    let key = crypto.generateKeySync("hmac", {length: 128}).export().toString("hex")
                    let cryptoKey = await bcrypt.hash(key, 10)
                    await transactions.updateOne({path: specifiedPath.path + (alreadyCreated ? alreadyCreated.url : "/" + url)}, {
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
                    if(specifiedPath.directory) return res.status(400).send({ error: "404 NOT FOUND", message: "Could not find the object being requested to delete." })
                    if(req.query.overwrite) {
                        await transactions.deleteOne({path: specifiedPath.path})
                    } else {
                        let exists = await transactions.find({path: specifiedPath.path})
                        if(exists.length) return res.status(403).send({error: "403 FORBIDDEN", message: "The object name you are deleting currently has uploading objects associated with it. If you want to overwrite them, input it in the query params.", type: "OverwriteErr", affectedFiles: await Promise.all(exists.map(async e => {
                            let mapping = await mappings.findOne({path: e.path})
                            return [...(mapping?.virtualPath || []), mapping?.name]
                        }))})
                    }
                    await fs.rm(bucket as string + specifiedPath.path)
                    await mappings.deleteOne({path: specifiedPath.path})
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