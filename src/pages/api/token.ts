import { NextApiRequest, NextApiResponse } from "next";
import fs from "fs/promises"
import types from "../../../types.json"
import prettyBytes from "pretty-bytes";
import dayjs from "dayjs";
import jwt from "jsonwebtoken"
import { authorized, transactions } from "../../../mongodb";
import getFolderSize from "get-folder-size"
import { createReadStream, createWriteStream } from "fs";
import crypto from "crypto"
import bcrypt from "bcrypt"
import { Readable } from "stream";

let { bucket } = process.env


export default async function handler(req: NextApiRequest, res: NextApiResponse,) {
    let user = ""
    try {
        user = jwt.verify(req.cookies.token as string, process.env.jwtToken as string) as string
    } catch (_) { }
   if(user != "root") return res.status(401).send({ error: "401 UNAUTHORIZED", message: "You are not authorized to use the following route." })
   switch (req.method) {
        case "GET":
            let token = jwt.sign(req.query.name as any, process.env.jwtToken as string)
            res.json({token})
        default:
            return res.status(404).send({ error: "403 FORBIDDEN", message: "This route is not allowed." })
    }
}