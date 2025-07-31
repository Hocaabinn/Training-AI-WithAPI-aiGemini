import 'dotenv/config';
import express from "express";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";

const app = express();
const upload = multer();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GEMINI_MODEL = "gemini-1.5-flash"; // atau "gemini-2.5-flash" jika sudah tersedia

app.use(express.json());

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server ini berjalan di http://localhost:${PORT}`));

// Fungsi bantu untuk ambil teks dari response
function extractText(resp) {
  try {
    const text =
      resp?.response?.candidates?.[0]?.content?.parts?.[0]?.text ??
      resp?.candidates?.[0]?.content?.parts?.[0]?.text ??
      resp?.candidates?.[0]?.content?.text;

    return text ?? JSON.stringify(resp, null, 2);
  } catch (err) {
    console.error("Error parsing text:", err);
    return JSON.stringify(resp, null, 2);
  }
}

// Endpoint untuk generate teks
app.post('/generate-text', async (req, res) => {
  try {
    const { prompt } = req.body;

    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    });

    res.json({ output: extractText(result) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint untuk generate teks dari gambar
app.post('/generate-text-from-image', upload.single('image'), async (req, res) => {
    try {
        const prompt = req.body?.prompt;
        if (!prompt) {
            res.status(400).json({ message: "Belum mengisi prompt!" });
            return;
        }
        const file = req.file;

        if (!file) {
            res.status(400).json({ message: "File 'image' harus di-upload ya!" });
            return;
        }

        // Validasi tipe file
        if (!file.mimetype.startsWith('image/')) {
            res.status(400).json({ message: "File harus berupa gambar!" });
            return;
        }
        const imgBase64 = file.buffer.toString('base64');
        const aiResponse = await ai.models.generateContent({
            model: GEMINI_MODEL, 
            contents: [{
                role: "user",
                parts: [
                    { text: prompt },
                    { 
                        inlineData: { 
                            mimeType: file.mimetype, 
                            data: imgBase64 
                        } 
                    }
                ]
            }]
        });
        res.json({ 
            result: extractText(aiResponse), 
            prompt: prompt,
            filename: file.originalname
        });
        
    } catch (err) {
        console.error("Error in generate-text-from-image:", err);
        res.status(500).json({ message: err.message });
    }
});
app.get('/', (req, res) => {
    res.json({ 
        message: "Server is running!", 
        endpoints: [
            "POST /generate-text",
            "POST /generate-text-from-image"
        ]
    });
});

//endpoint untuk generate-from-audio
app.post('/generate-from-audio', upload.single('audio'), async (req, res) => {
    try {
        const prompt = req.body?.prompt || "Transkripsi dan jelaskan isi dari audio ini";

        const file = req.file;

        // guard clause
        if (!file) {
            res.status(400).json({ message: "File 'audio' harus di-upload ya!" });
            return;
        }

        // Validasi tipe file audio
        const supportedAudioTypes = [
            'audio/mpeg',     // mp3
            'audio/mp4',      // m4
        ];

        if (!supportedAudioTypes.includes(file.mimetype)) {
            res.status(400).json({ 
                message: "Format audio tidak didukung! Gunakan: MP3, WAV, M4A, FLAC, OGG, atau WEBM",
                receivedType: file.mimetype
            });
            return;
        }
        const maxSize = 20 * 1024 * 1024; // 20MB
        if (file.size > maxSize) {
            res.status(400).json({ 
                message: "File audio terlalu besar! Maksimal 20MB",
                fileSize: `${(file.size / 1024 / 1024).toFixed(2)}MB`
            });
            return;
        }

        const audioBase64 = file.buffer.toString('base64');

        console.log(`Processing audio: ${file.originalname} (${file.mimetype}, ${(file.size / 1024 / 1024).toFixed(2)}MB)`);
        const aiResponse = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{
                role: "user",
                parts: [
                    { text: prompt },
                    { 
                        inlineData: { 
                            mimeType: file.mimetype, 
                            data: audioBase64 
                        } 
                    }
                ]
            }]
        });
        res.json({ 
            result: extractText(aiResponse),
            prompt: prompt,
            filename: file.originalname,
            fileType: file.mimetype,
            fileSize: `${(file.size / 1024 / 1024).toFixed(2)}MB`
        });
        
    } catch (err) {
        console.error("Error in generate-from-audio:", err);
        
        // menghandle specific Gemini API errors
        if (err.message.includes('Audio')) {
            res.status(400).json({ 
                message: "Error processing audio file. Pastikan format dan kualitas audio sesuai.",
                error: err.message 
            });
        } else {
            res.status(500).json({ message: err.message });
        }
    }
});
app.get('/', (req, res) => {
    res.json({ 
        message: "Server is running!", 
        endpoints: [
            "POST /generate-text",
            "POST /generate-text-from-image",
            "POST /generate-from-audio"
        ]
    });
});