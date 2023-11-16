import mongoose from "mongoose"

var leaderboard = new mongoose.Schema<any>({
    cryptoKey: String,
    path: String
})

export default mongoose.models.transactions || mongoose.model("transactions", leaderboard)