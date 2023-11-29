const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const PORT = 3001;
const cors = require('cors'); 
const axios = require('axios');
const pdf = require('pdf-parse');
const fs = require('fs');
const openai = require('openai');
const multer = require('multer');
const pdfjs = require('pdfjs-dist');
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));
let knowledgeDatabase = [];

app.post('/api/chat', (req, res) => {
    const userMessage = req.body.message.trim();

    if (userMessage !== '') {
        // Call OpenAI API to get AI response based on userMessage
        // For now, generate a random response (replace this with actual API call)
        const aiResponse = generateRandomResponse();
        res.json({ user: userMessage, ai: aiResponse });
    } else {
        res.status(400).json({ error: 'Invalid input' });
    }
});

function generateRandomResponse() {
    const responses = [
        "Hello",
        "That's interesting!",
        "Tell me more.",
        "I'm still learning.",
        "Ask me something else.",
    ];
    const randomIndex = Math.floor(Math.random() * responses.length);
    return responses[randomIndex];
}
app.post('/api/openai', async (req, res) => {
    const userMessage = req.body.message.trim();

    if (userMessage !== '') {
        try {
            const aiResponse = await getOpenAIResponse(userMessage);
            res.json({ ai: aiResponse });
        } catch (error) {
            console.error('Error:', error.message);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    } else {
        res.status(400).json({ error: 'Invalid input' });
    }
});

async function getOpenAIResponse(userMessage) {
    const openaiEndpoint = 'https://api.openai.com/v1/engines/text-davinci-003/completions';
    const openaiApiKey = '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'; 

    try {
        const response = await axios.post(
            openaiEndpoint,
            {
                prompt: userMessage,
                max_tokens: 150,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiApiKey}`,
                },
            }
        );

        return response.data.choices[0].text.trim();
    } catch (error) {
        console.error('Error:', error.response ? error.response.data : error.message);
        throw new Error('Failed to get OpenAI response');
    }
}


// Set your OpenAI API key
const apiKey = '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';

// Function to read text from a PDF file
async function readTextFromPDF(pdfPath) {
  try {
    const pdfBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(pdfBuffer);

    return data.text;
  } catch (error) {
    console.error('Error reading PDF:', error.message);
    throw new Error('Failed to read PDF');
  }
}

// Function to perform text embedding using OpenAI API
async function embedTextWithOpenAI(text) {
  try {
    // Make a request to OpenAI's text-embedding-002 API
    const response = await axios.post(
      'https://api.openai.com/v1/text-embedding-002/embed',
      { text: [text] },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
      }
    );

    // Extract the embedding from the response
    const embedding = response.data.embedding[0];

    // Return the embedding
    return embedding;
  } catch (error) {
    console.error('Error:', error.message);
    throw new Error('Failed to perform text embedding with OpenAI');
  }
}

// Function to find the most similar entry in the knowledge database
function findMostSimilarEntry(userQueryEmbedding) {
  // For simplicity, using a basic approach (you may need more sophisticated methods)
  let mostSimilarEntry = null;
  let highestSimilarity = -1;

  knowledgeDatabase.forEach((entry) => {
    const entryEmbedding = entry.embedding;

    const similarity = calculateSimilarity(userQueryEmbedding, entryEmbedding);

    if (similarity > highestSimilarity) {
      highestSimilarity = similarity;
      mostSimilarEntry = entry;
    }
  });

  return mostSimilarEntry;
}

// Function to calculate similarity between two embeddings (cosine similarity)
function calculateSimilarity(embedding1, embedding2) {
  const dotProduct = embedding1.reduce((acc, val, i) => acc + val * embedding2[i], 0);
  const magnitude1 = Math.sqrt(embedding1.reduce((acc, val) => acc + val ** 2, 0));
  const magnitude2 = Math.sqrt(embedding2.reduce((acc, val) => acc + val ** 2, 0));

  return dotProduct / (magnitude1 * magnitude2);
}

// API endpoint to handle user queries
app.post('/api/processpdf', async (req, res) => {
  const userQuestion = req.body.question.trim();

  if (userQuestion !== '') {
    try {
      // Read text from the PDF
      const pdfPath = 'input1.pdf';
      const pdfText = await readTextFromPDF(pdfPath);

      // Embed text using OpenAI API
      const userQueryEmbedding = await embedTextWithOpenAI(userQuestion);

      // Find the most similar entry in the knowledge database
      const mostSimilarEntry = findMostSimilarEntry(userQueryEmbedding);

      // Respond with the answer
      const answer = mostSimilarEntry ? mostSimilarEntry.answer : 'Sorry, I don\'t have information on that.';
      res.json({ user: userQuestion, ai: answer });
    } catch (error) {
      console.error('Error:', error.message);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  } else {
    res.status(400).json({ error: 'Invalid input' });
  }
});
// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Set up your OpenAI API key
openai.api_key = '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';

app.post('/api/upload', upload.array('pdfs', 5), async (req, res) => {
    try {
        const pdfTexts = await Promise.all(req.files.map(async (file) => {
            const dataBuffer = file.buffer;
            const dataString = dataBuffer.toString();
            const pdfData = await pdfjs.getDocument({ data: dataBuffer }).promise;
            const numPages = pdfData.numPages;
            let pdfText = '';

            for (let pageNumber = 1; pageNumber <= numPages; pageNumber++) {
                const page = await pdfData.getPage(pageNumber);
                const pageText = await page.getTextContent();
                
                // Extract text from the pageText array
                pdfText += pageText.items.map(item => item.str).join(' ');
          
            }

            return pdfText;
        }));

        const userContext = req.body.context;

        // Combine PDF texts and user context for the OpenAI prompt
        const inputText = `${userContext}\n${pdfTexts.join('\n')}`;
console.log(inputText);
        // Use OpenAI to generate a response
        const response = await openai.Completion.create({
            model: 'text-davinci-003',
            prompt: inputText,
            temperature: 0.7,
            max_tokens: 150,
        });

        res.json({ response: response.choices[0].text });
    } catch (error) {
        console.error('Error processing PDFs:', error);
        res.status(500).json({ error: 'Internal Server Error',details:error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});