import mongoose from "mongoose";
import auth from "./schemas/authorized"
import transactionsSchema from "./schemas/transactions";
import mappingsSchema from "./schemas/mappings"

mongoose.connect(process.env.MONGODB_URI as string, {
    dbName: "hpskloud",
    readPreference: "primaryPreferred",
    authSource: "$external",
    authMechanism: "MONGODB-X509",
    tlsCertificateKeyFile: process.env.keyPath,
} as any);

export const authorized = auth
export const transactions = transactionsSchema
export const mappings = mappingsSchema