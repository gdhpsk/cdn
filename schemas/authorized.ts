import mongoose from "mongoose"

var leaderboard = new mongoose.Schema<any>({
    username: String,
    hasAccessTo: [String]
})

export default mongoose.models.authorized || mongoose.model("authorized", leaderboard)