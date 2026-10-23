import express from "express";
import path from "node:path";

const app = express();
const publicDir = path.join(import.meta.dirname, "public");

app.use(express.static(publicDir))
app.listen(3000, (listener) => {
    console.log("Listening on http://localhost:3000");
})
