import mongoose from "mongoose"

var leaderboard = new mongoose.Schema<any>({
    url: String,
    path: String,
    virtualPath: [String],
    name: String,
    directory: Boolean
})

export default mongoose.models.mappings || mongoose.model("mappings", leaderboard)