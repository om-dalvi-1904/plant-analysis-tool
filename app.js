require("dotenv").config()
let express = require("express")
let multer = require("multer")
let PDFDocumnet = require("pdfkit")
let fs = require("fs")
let fsPromises = fs.promises
let path = require("path")
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { error, log } = require("console")

let app = express()
let port = process.env.PORT || 5000

//! configuring the multer
let upload = multer({dest:"upload/"})
app.use(express.json({limit:"10mb"}))

//! initialize the Gemini AI
let genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
app.use(express.static("public"))

//! routes
//? sending data
app.post("/analyze", upload.single("image"), async (req, res) => {
    try{
        let file = req.file
        let imagePath = "upload/" + file.filename
        let imageData = await fsPromises.readFile(imagePath,{
        encoding:"base64",
        })
        //* using gemini AI
        let model = genAI.getGenerativeModel({model:"gemini-1.5-flash"})
        let result = await model.generateContent([
            "tell me about this plant in the image. tell me some interesting facts about this plant, where it is found, where it is used and some more information about this plant. also give me some care recommendations.",
            {
                inlineData:{
                    mimeType: req.file.mimetype,
                    data: imageData
                }
            }
        ])
        let plantInfo = result.response.text()
        await fsPromises.unlink(imagePath)
        res.json({
            result:plantInfo,
            image:`data:${req.file.mimetype};base64,${imageData}`,
        })
    }catch(error){
        res.status(500).json({
            error: error.message
        })
    }
})
//? downloading pdf
app.post("/download", express.json(),async (req, res) => {
    let {result, image} = req.body
    try {
        //ensure the directory exists
        let reportsDir = path.join(__dirname, "reports")
        await fsPromises.mkdir(reportsDir, {recursive: true})
        //generate pdf
        let filename = `report-${Date.now()}.pdf`
        let filePath = path.join(reportsDir, filename) 
        let writeStream = fs.createWriteStream(filePath)
        let doc = new PDFDocumnet()
        doc.pipe(writeStream)
        //content of the pdf
        doc.fontSize(24).text("Plant Analysis Report", {
            align: "center",
            fontWeight: "bold",
        })
        doc.moveDown()
        doc.fontSize(16).text(`Date:${new Date().toLocaleDateString()}`)
        doc.moveDown()
        doc.fontSize(13).text(result,{
            align: "left"
        })
        //insert image to pdf
        if(image){
            let base64Image = image.replace(/^data:image\/\w+;base64,/, "")
            let buffer = Buffer.from(base64Image, "base64")
            doc.moveDown()
            doc.image(buffer, {
                fit: [500, 500],
                align: "center",
                valign: "center",
            })
        }
        doc.end()
        //wait for pdf to return
        await new Promise((resolve,reject)=>{
            writeStream.on("finish", resolve)
            writeStream.on("error", reject)
        })
        res.download(filePath,(err)=>{
            if(err){
                res.status(500).json({
                    error:"Error downloading the PDF report."
                })
            }
            fsPromises.unlink(filePath)
        })
    } catch (error) {
        console.error("Error generating the PDF report: ", error)    
        res.status(500).json({
            error:"An error occured while generating the PDF report."
        })    
    }
})

//! start the server
app.listen(port, () => {
    console.log(`Server is live on http://localhost:${port}`)
})