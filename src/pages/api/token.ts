import { NextApiRequest, NextApiResponse } from "next";
import jwt from "jsonwebtoken"

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