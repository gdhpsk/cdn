import mongoose from "mongoose"

var leaderboard = new mongoose.Schema({
    cryptoKey: String,
    path: String,
    uploadId: String,
    parts: [{
        ChecksumCRC32: String,
        ChecksumCRC32C: String,
        ChecksumSHA1: String,
        ChecksumSHA256: String,
        ETag: String,
        PartNumber: Number
    }]
})

export default mongoose.models.transactions || mongoose.model("transactions", leaderboard)