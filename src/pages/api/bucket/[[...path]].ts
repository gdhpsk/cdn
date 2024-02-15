import { NextApiRequest, NextApiResponse } from "next";
import types from "../../../../types.json"
import prettyBytes from "pretty-bytes";
import dayjs from "dayjs";
import jwt from "jsonwebtoken"
import { authorized, transactions, mappings } from "../../../../mongodb";
import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsCommand, PutObjectCommand, S3Client, UploadPartCommand, UploadPartCopyCommand } from "@aws-sdk/client-s3";
import crypto from "crypto"
import bcrypt from "bcrypt"
import { Readable } from "stream";


export default async function handler(req: NextApiRequest, res: NextApiResponse,) {
    res.setHeader("Access-Control-Allow-Origin", "*")
    const client = new S3Client({ endpoint: process.env.SPACES_URL, forcePathStyle: false, credentials: { secretAccessKey: process.env.SPACES_SECRET as string, accessKeyId: process.env.SPACES_KEY as string }, region: "us-east-1" });
    let user = ""
    try {
        user = jwt.verify(req.cookies.token as string, process.env.jwtToken as string) as string
    } catch (_) { }
    if (req.url == "/api/bucket/ping") {
        let files: any[] = []
        let marker = ""
                    while (true) {
                        let command = await client.send(new ListObjectsCommand({
                            Bucket: "hpskloud",
                            Marker: marker
                        }))
                        files.push(...Array.from(command.Contents || []))
                        if (command.NextMarker) {
                            marker = command.NextMarker
                            continue;
                        } else {
                            break
                        }
                    }
        const size = files.map(e => e.Size).reduce((a,b) => a+b)
        let total = 250 // in gigs
        return res.status(200).send({ user, total, used: JSON.parse((size / 1000 / 1000 / 1000).toFixed(5)) })
    }
    if (!req.query.path || !["dir", "file"].includes((req.query.path[0]))) return res.status(400).send({ error: "400 BAD REQUEST", message: "Could not find the URL and method provided." })
    if (req.query.path.length > 2) return res.status(400).send({ error: "400 BAD REQUEST", message: "Too many query parameters" })
    let specifiedPath = await mappings.findOne({ url: "/" + (req.query.path[1] || "") })
    if (!specifiedPath) return res.status(400).send({ error: "400 BAD REQUEST", message: "Could not find the corresponding object." })
    if (user !== "root" && req.method !== "GET") {
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
                                        cond: { $in: ["$$item", specifiedPath.path.split("/").map((e: any, i: any, a: any) => a.slice(0, i + 1).join("/") || "/")] }
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
                    let marker = ""
                    let files: any[] = []
                    while (true) {
                        let command = await client.send(new ListObjectsCommand({
                            Bucket: "hpskloud",
                            Prefix: specifiedPath.path.replace("/", ""),
                            Marker: marker
                        }))
                        files.push(...Array.from(command.Contents || []))
                        if (command.NextMarker) {
                            marker = command.NextMarker
                            continue;
                        } else {
                            break
                        }
                    }
                    files = files.filter(e => e.Key.startsWith(specifiedPath.path.replace("/", "")) && (e.Key?.endsWith("/") ? e.Key.slice(0, e.Key.length - 1) : e.Key) != specifiedPath.path.replace("/", ""))
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
                            path: { $in: files.map(e => "/" + (e.Key?.endsWith("/") ? e.Key.slice(0, e.Key.length - 1) : e.Key)) }
                        }
                    },
                    {
                        $lookup: {
                            from: "authorizeds",
                            let: { path: "$path" },
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
                                            { $ne: [user, "root"] },
                                            { $ne: [{ $size: "$viewable" }, 0] }
                                        ]
                                    },
                                    then: false,
                                    else: true
                                },
                            }
                        }
                    }
                    ])
                    files = files.map(e => {
                        let extras = aggregate.find(x => x.path == "/" + (e.Key?.endsWith("/") ? e.Key.slice(0, e.Key.length - 1) : e.Key))
                        let isDir = e.Key.endsWith("/")
                        e.Key = isDir ? e.Key.slice(0, e.Key.length - 1) : e.Key
                        let { viewable, url, name } = extras
                        return {
                            name: !isDir && name.indexOf(".") != -1 ? name.split(".").slice(0, name.split(".").length - 1).join(".") : name,
                            type: !isDir ? name.split(".").at(-1) : undefined,
                            isDir,
                            authorized: viewable,
                            url,
                            path: "/" + e.Key,
                            mime: !isDir ? (types as any)["." + name.split(".").at(-1).toLowerCase()] || "application/octet-stream" : undefined,
                            size: !isDir ? prettyBytes(e.Size) : ("/" + e.Key) == specifiedPath.path + url && viewable ? prettyBytes(files.filter(x => x.Key.startsWith(e.Key)).map(e => e.Size).reduce((a, b) => a + b, 0)) : 0,
                            modified: dayjs(new Date(e.LastModified).getTime()).format("MMMM DD, YYYY hh:mm:ss A")
                        }
                    })
                    files = files.filter(e => e && e.authorized && e.path == specifiedPath.path + e.url)
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
                                                    cond: { $in: ["$$item", specifiedPath.path.split("/").map((e: any, i: any, a: any) => a.slice(0, i + 1).join("/") || "/")] }
                                                }
                                            }]
                                        }, 0]
                                    }]
                                }, then: true, 'else': false
                            }
                        }
                    })
                    let previousPaths = !valid ? await Promise.all(specifiedPath.path.split("/").slice(1).map(async (e: any, i: any, a: any) => {
                        let path = a.slice(0, i + 1).join("/") || ""
                        return (await mappings.findOne({ path: "/" + path })).url
                    })) : req.query.path[0] ? ["/" + req.query.path[0]] : []
                    return res.status(200).json({ files, editable, path: !valid ? specifiedPath.virtualPath : ["/", ...(req.query.path[0] ? [specifiedPath.virtualPath.at(-1)] : [])], previousPaths: ["/", ...previousPaths], hasVisibleAccess: !valid })
                } catch (e) {
                    console.log(e)
                    return res.status(404).json({ error: "404 NOT FOUND", message: "Could not find the group requested" })
                }
            case "POST":
                try {
                    if (!req.body.name || !specifiedPath.directory) return res.status(400).send({ error: "400 BAD REQUEST", message: "Please enter an object name!" })
                    let existing = await mappings.findOne({ virtualPath: specifiedPath.virtualPath, name: req.body.name, directory: false }) || await mappings.findOne({ virtualPath: [...specifiedPath.virtualPath, req.body.name], directory: true })
                    if (!req.query.overwrite && existing?.directory == true) return res.status(400).send({ error: "400 BAD REQUEST", message: "That group already exists!", type: "OverwriteErr" })
                    if (existing?.directory == false) return res.status(400).json({ error: "400 BAD REQUEST", message: `That group is of type "${existing.directory ? "Folder" : "File"}" meaning it cannot be overwritten!` })
                    let url = crypto.generateKeySync("hmac", { length: 48 }).export().toString("hex")
                    while (true) {
                        let exists = await mappings.exists({ url: "/" + url })
                        if (!exists) break;
                        url = crypto.generateKeySync("hmac", { length: 48 }).export().toString("hex")
                    }
                    if (req.query.overwrite && existing) {
                        await client.send(new DeleteObjectCommand({
                            Bucket: "hpskloud",
                            Key: existing.path.replace("/", "") + "/"
                        }))
                        await mappings.deleteMany({ path: { $regex: new RegExp(existing.path), $ne: existing.path } })
                        await client.send(new PutObjectCommand({
                            Bucket: "hpskloud",
                            Key: existing.path.replace("/", "") + "/"
                        }))
                    } else {
                        await client.send(new PutObjectCommand({
                            Bucket: "hpskloud",
                            Key: (specifiedPath.path + "/" + url).replace("/", "") + "/"
                        }))
                    }
                    let name = existing ? existing.name : req.body.name
                    await mappings.updateOne({ path: existing ? existing.path : specifiedPath.path + "/" + url }, {
                        $setOnInsert: {
                            path: specifiedPath.path + "/" + url,
                            virtualPath: [...specifiedPath.virtualPath, name],
                            name: req.body.name,
                            url: "/" + url,
                            directory: true
                        }
                    }, { upsert: true })
                    return res.status(201).send({ hash: url })
                } catch (_) {
                    console.log(_)
                    return res.status(400).send({ error: "400 BAD REQUEST", message: "That group name has a corresponding file name!" })
                }
            case "PATCH":
                try {
                    if ((req.query.path as string[]).length == 0) return res.status(400).send({ error: "400 BAD REQUEST", message: "Please enter an object name to rename!" })
                    let existing = await mappings.findOne({ virtualPath: req.body.newDir, directory: true })
                    if (!existing) return res.status(400).send({ error: "400 BAD REQUEST", message: "Could not find new path." })
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
                                                    cond: { $in: ["$$item", [existing.path.split("/").slice(1)].map((e, i, a) => a.slice(0, i + 1).join("/") || "/")] }
                                                }
                                            }]
                                        }, 0]
                                    }]
                                }, then: true, 'else': false
                            }
                        }
                    })
                    if (!valid) return res.status(401).send({ error: "401 UNAUTHORIZED", message: "You are not authorized to move the object to the following path." })
                    if (req.query.overwrite) {
                        await transactions.deleteMany({ path: new RegExp(existing.path + "/" + req.query.path[0] + "($|/)") })
                    } else {
                        let exists = await transactions.find({ path: new RegExp(existing.path + "/" + req.query.path[0] + "($|/)") })
                        if (exists.length) return res.status(403).send({
                            error: "403 FORBIDDEN", message: "The object name you are editing currently has uploading objects associated with it.", type: "TransactionOverwriteErr", affectedFiles: await Promise.all(exists.map(async e => {
                                let mapping = await mappings.findOne({ path: e.path })
                                return [...(mapping?.virtualPath || []), mapping?.name]
                            }))
                        })
                    }
                    let exists = specifiedPath.directory ? (await mappings.findOne({ virtualPath: existing.virtualPath, name: req.body.newName, url: { $ne: "/" + req.query.path[0] } }) || await mappings.findOne({ virtualPath: [...existing.virtualPath, req.body.newName], url: { $ne: "/" + req.query.path[0] } })) : (await mappings.findOne({ virtualPath: [...existing.virtualPath, req.body.newName], url: { $ne: "/" + req.query.path[0] } }) || await mappings.findOne({ virtualPath: existing.virtualPath, name: req.body.newName, url: { $ne: "/" + req.query.path[0] } }))
                    if (!req.query.overwriteGroup && exists !== null && exists?.directory == specifiedPath.directory) return res.status(403).send({ error: "403 FORBIDDEN", message: "That new object directory already exists. Pass the overwriteGroup param to try and overwrite it.", type: "GroupOverwriteErr" })
                    if (exists !== null && exists?.directory !== specifiedPath.directory) return res.status(403).send({ error: "403 FORBIDDEN", message: `That new object directory is of type "${exists.directory ? "Folder" : "File"}", meaning you cannot overwrite it!` })
                    if (req.query.overwriteGroup) {
                        let deletedObj = specifiedPath.directory ? await mappings.findOneAndDelete({ virtualPath: [...existing.virtualPath, req.body.newName], url: { $ne: "/" + req.query.path[0] } }) : await mappings.findOneAndDelete({ virtualPath: existing.virtualPath, name: req.body.newName, url: { $ne: "/" + req.query.path[0] } })
                        try {
                            await client.send(new DeleteObjectCommand({
                                Bucket: "hpskloud",
                                Key: deletedObj.path.replace("/", "")
                            }))
                        } catch (_) { }
                    };
                    if(((existing.path + "/" + req.query.path[0]).replace("/", "") + `${specifiedPath.directory ? "/" : ""}`) != (specifiedPath.path.replace("/", "") + `${specifiedPath.directory ? "/" : ""}`)) {
                    let marker = ""
                    let files: any[] = []
                    while (true) {
                        let command = await client.send(new ListObjectsCommand({
                            Bucket: "hpskloud",
                            Prefix: specifiedPath.path.replace("/", "") + `${specifiedPath.directory ? "/" : ""}`,
                            Marker: marker
                        }))
                        files.push(...Array.from(command.Contents || []))
                        if (command.NextMarker) {
                            marker = command.NextMarker
                            continue;
                        } else {
                            break
                        }
                    }
                    const size = files.map(e => e.Size).reduce((a,b) => a+b)
                    let parts = []
                    let aws_key = await client.send(new CreateMultipartUploadCommand({
                        Bucket: "hpskloud",
                        Key: (existing.path + "/" + req.query.path[0]).replace("/", "") + `${specifiedPath.directory ? "/" : ""}`
                    }))
                    for(let i = 0; i <= Math.floor(size / 8000000); i++) {
                        let part = await client.send(new UploadPartCopyCommand({
                            Bucket: "hpskloud",
                            Key: (existing.path + "/" + req.query.path[0]).replace("/", "") + `${specifiedPath.directory ? "/" : ""}`,
                            UploadId: aws_key.UploadId,
                            PartNumber: i+1,
                            CopySource: `/hpskloud/${specifiedPath.path.replace("/", "") + `${specifiedPath.directory ? "/" : ""}`}`,
                            CopySourceRange: `bytes=${i*8000000}-${Math.min((i+1)*8000000, size) - 1}`
                        }))
                        parts.push({
                            ...part.CopyPartResult,
                                PartNumber: i+1
                        })
                    }
                    await client.send(new CompleteMultipartUploadCommand({
                        Bucket: "hpskloud",
                        Key: (existing.path + "/" + req.query.path[0]).replace("/", "") + `${specifiedPath.directory ? "/" : ""}`,
                        UploadId: aws_key.UploadId,
                        MultipartUpload: {
                            Parts: parts
                        }
                    }))
                    try {
                        await client.send(new DeleteObjectCommand({
                            Bucket: "hpskloud",
                            Key: specifiedPath.path.replace("/", "") + `${specifiedPath.directory ? "/" : ""}`
                        }))
                    } catch(_) {}
                }
                    await mappings.updateMany({ path: { $regex: new RegExp(specifiedPath.path), $ne: specifiedPath.path } }, [{
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
                    await mappings.updateOne({ path: specifiedPath.path }, [{
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
                    if (req.query.overwrite) {
                        await transactions.deleteMany({ path: new RegExp("/" + req.query.path[0] + "($|/)") })
                    } else {
                        let exists = await transactions.find({ path: new RegExp("/" + req.query.path[0] + "($|/)") })
                        if (exists.length) return res.status(403).send({
                            error: "403 FORBIDDEN", message: "The object name you are deleting currently has uploading objects associated with it. If you want to overwrite them, input it in the query params.", type: "OverwriteErr", affectedFiles: await Promise.all(exists.map(async e => {
                                let mapping = await mappings.findOne({ path: e.path })
                                return [...(mapping?.virtualPath || []), mapping?.name]
                            }))
                        })
                    }
                    await client.send(new DeleteObjectCommand({
                        Bucket: "hpskloud",
                        Key: specifiedPath.path.replace("/", "") + "/"
                    }))
                    await mappings.deleteMany({ path: new RegExp("^" + specifiedPath.path + "($|/)") })
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
                    if ((req.query.path as string[]).length != 1) return res.status(400).send({ error: "400 BAD REQUEST", message: "Please enter an object hash to view!" })
                    let command = await client.send(new HeadObjectCommand({
                        Bucket: "hpskloud",
                        Key: specifiedPath.path.replace("/", "")
                    }))
                    if (command.$metadata.httpStatusCode != 200) throw new Error()
                    function iOS() {
                        if (req.query.partialContent == "false") return true;
                        if (req.query.partialContent == "true") return false;
                        return [
                            'iPad',
                            'iPhone',
                            'iPod'
                        ].find(e => (req.headers["user-agent"] || "").includes(e)) || /^((?!chrome|android).)*safari/i.test(req.headers['user-agent'] || "");
                    }
                    let str = "." + specifiedPath.name.split(".").at(-1)?.toLowerCase() || "bin"
                    let c_size = 1000000
                    let start = iOS() ? 0 : parseInt(req.headers.range?.split("=")?.[1] || "0")
                    let end = command.ContentLength
                    if (req.headers.range && !iOS()) {
                        end = c_size + start > (command?.ContentLength || 0) ? (command.ContentLength || 0) : c_size + start
                        res.setHeader("Content-Range", `bytes ${start}-${end - 1}/${command.ContentLength}`)
                    } else {
                        res.setHeader("Content-Disposition", `${req.query.download ? "attachment" : "inline"}; filename="${req.query.name ? req.query.name + "." + specifiedPath.name.split(".").at(-1) : specifiedPath.name}"`)
                    }
                    res.writeHead(req.headers.range && !iOS() ? 206 : 200, {
                        'content-length': (end || 0) - start,
                        'accept-ranges': 'bytes',
                        'content-type': (types as any)[str] || "application/octet-stream"
                    })
                    let file = await client.send(new GetObjectCommand({
                        Bucket: "hpskloud",
                        Key: specifiedPath.path.replace("/", ""),
                        Range: `bytes=${start}-${(end || 0) - 1}`
                    }))
                    Readable.fromWeb(file.Body?.transformToWebStream() as any, { highWaterMark: c_size }).pipe(res)
                    //createReadStream(bucket as string + specifiedPath.path, {highWaterMark: c_size, start, end}).pipe(res)
                    break;
                } catch (_) {
                    console.log(_)
                    return res.status(404).send({ error: "404 NOT FOUND", message: "Could not find the object requested" })
                }
            case "POST":
                try {
                    if (!req.query.name || !specifiedPath.directory) return res.status(400).send({ error: "400 BAD REQUEST", message: "Please enter an object name in query params!" })
                    if (req.body.length > 8000000) return res.json({ error: "400 BAD REQUEST", message: "Max chunks allowed to be sent in are 16 MB!" })
                    if (!req.query.overwrite) {
                        let alreadyCreated = await mappings.findOne({ virtualPath: specifiedPath.virtualPath, name: req.query.name })
                        let tExists = await transactions.findOne({ path: specifiedPath.path + alreadyCreated?.url || "" })
                        if (tExists) {
                            try {
                                let isAuthorized = await bcrypt.compare(req.headers["x-secret-token"] as any, tExists.cryptoKey as any)
                                if (!isAuthorized) throw new Error("")
                            } catch (_) {
                                return res.status(401).send({ error: "401 UNAUTHORIZED", message: "Not a valid token for said path.", type: "InvalidTokenErr" })
                            }
                            if (req.body == "END") {
                                await client.send(new CompleteMultipartUploadCommand({
                                    Bucket: "hpskloud",
                                    Key: tExists.path.replace("/", ""),
                                    UploadId: tExists.uploadId,
                                    MultipartUpload: {
                                        Parts: tExists.parts
                                    }
                                }))
                                await transactions.deleteOne({ path: alreadyCreated.path })
                                return res.status(201).send({ hash: alreadyCreated.url.split("/")[1] })
                            }
                            if (req.body == "CANCEL") {
                                await transactions.deleteOne({ path: alreadyCreated.path })
                                await mappings.deleteOne({ path: alreadyCreated.path })
                                await client.send(new AbortMultipartUploadCommand({
                                    Bucket: "hpskloud",
                                    Key: alreadyCreated.path.replace("/", ""),
                                    UploadId: tExists.uploadId
                                }))
                                return res.status(204).send(null)
                            }
                            try {
                                let buffer = Buffer.from(req.body);
                                let part = await client.send(new UploadPartCommand({
                                    Bucket: "hpskloud",
                                    Key: tExists.path.replace("/", ""),
                                    UploadId: tExists.uploadId,
                                    PartNumber: tExists.parts.length + 1,
                                    Body: buffer
                                }))
                                await transactions.updateOne({ path: tExists.path }, {
                                    $push: {
                                        parts: {
                                            ChecksumCRC32: part.ChecksumCRC32,
                                            ChecksumCRC32C: part.ChecksumCRC32C,
                                            ChecksumSHA1: part.ChecksumSHA1,
                                            ChecksumSHA256: part.ChecksumSHA256,
                                            ETag: part.ETag,
                                            PartNumber: tExists.parts.length + 1
                                        }
                                    }
                                })
                            } catch (_) {
                                return res.status(400).send({ error: "400 BAD REQUEST", message: "This group does not exists!" })
                            }
                            return res.status(201).send(null)
                        }
                    }
                    let alreadyCreated = await mappings.findOne({ virtualPath: [...specifiedPath.virtualPath, req.query.name], directory: true }) || await mappings.findOne({ virtualPath: specifiedPath.virtualPath, name: req.query.name, directory: false })
                    if (!req.query.overwrite && alreadyCreated?.directory == false) return res.status(400).send({ error: "400 BAD REQUEST", message: "File already exists. If you want to overwrite, add the overwrite query param.", type: "OverwriteErr" })
                    if (alreadyCreated?.directory == true) return res.status(400).send({ error: "400 BAD REQUEST", message: "Folder with the same name already exists" })

                    let url = ""
                    if (!alreadyCreated) {
                        url = crypto.generateKeySync("hmac", { length: 48 }).export().toString("hex")
                        while (true) {
                            let exists = await mappings.exists({ url: "/" + url })
                            if (!exists) break;
                            url = crypto.generateKeySync("hmac", { length: 48 }).export().toString("hex")
                        }
                    }
                    let buffer = Buffer.from(req.body);
                    let aws_key = await client.send(new CreateMultipartUploadCommand({
                        Bucket: "hpskloud",
                        Key: (specifiedPath.path + (alreadyCreated ? alreadyCreated.url : "/" + url)).replace("/", "")
                    }))
                    let part = await client.send(new UploadPartCommand({
                        Bucket: "hpskloud",
                        Key: (specifiedPath.path + (alreadyCreated ? alreadyCreated.url : "/" + url)).replace("/", ""),
                        UploadId: aws_key.UploadId,
                        PartNumber: 1,
                        Body: buffer
                    }))
                    await mappings.updateOne({ path: specifiedPath.path + (alreadyCreated ? alreadyCreated.url : "/" + url) }, {
                        $setOnInsert: {
                            path: specifiedPath.path + "/" + url,
                            url: "/" + url,
                            virtualPath: specifiedPath.virtualPath,
                            name: req.query.name,
                            directory: false
                        }
                    }, { upsert: true })
                    let key = crypto.generateKeySync("hmac", { length: 128 }).export().toString("hex")
                    let cryptoKey = await bcrypt.hash(key, 10)
                    await transactions.updateOne({ path: specifiedPath.path + (alreadyCreated ? alreadyCreated.url : "/" + url) }, {
                        $set: {
                            cryptoKey,
                            parts: [{
                                ChecksumCRC32: part.ChecksumCRC32,
                                ChecksumCRC32C: part.ChecksumCRC32C,
                                ChecksumSHA1: part.ChecksumSHA1,
                                ChecksumSHA256: part.ChecksumSHA256,
                                ETag: part.ETag,
                                PartNumber: 1
                            }],
                            uploadId: aws_key.UploadId
                        }
                    }, { upsert: true, runValidators: true })
                    return res.status(201).send({ key })
                } catch (e) {
                    console.log(e)
                    return res.status(400).send({ error: "400 BAD REQUEST", message: "Make sure your body is an array of numbered ascii chars!" })
                }
            case "DELETE":
                try {
                    if (specifiedPath.directory) return res.status(400).send({ error: "404 NOT FOUND", message: "Could not find the object being requested to delete." })
                    if (req.query.overwrite) {
                        await transactions.deleteOne({ path: specifiedPath.path })
                    } else {
                        let exists = await transactions.find({ path: specifiedPath.path })
                        if (exists.length) return res.status(403).send({
                            error: "403 FORBIDDEN", message: "The object name you are deleting currently has uploading objects associated with it. If you want to overwrite them, input it in the query params.", type: "OverwriteErr", affectedFiles: await Promise.all(exists.map(async e => {
                                let mapping = await mappings.findOne({ path: e.path })
                                return [...(mapping?.virtualPath || []), mapping?.name]
                            }))
                        })
                    }
                    await client.send(new DeleteObjectCommand({
                        Bucket: "hpskloud",
                        Key: specifiedPath.path.replace("/", "")
                    }))
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