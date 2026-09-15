/**
 * STREAMING_CHUNK:Initializing Express Server and OpenAI SDK...
 */
const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');

const app = express();
const port = process.env.PORT || 3000;

// Middleware configuration
app.use(express.json());
app.use(cors());

// Initialize OpenAI client using environment variables
// Ensure process.env.OPENAI_API_KEY is set in your deployment environment
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'your-openai-api-key-here'
});

// In-memory knowledge base store (replace with PostgreSQL / pgvector or Pinecone in production)
const knowledgeBases = new Map();

/**
 * STREAMING_CHUNK:Defining Knowledge Training Endpoint (RAG Setup)...
 */
// Endpoint to train or update the AI bot with company/product data
app.post('/api/train', (req, res) => {
    const { botId, companyName, description, faqs, url } = req.body;

    if (!botId) {
        return res.status(400).json({ error: 'botId is required' });
    }

    // Store the knowledge base context for this specific chatbot
    knowledgeBases.set(botId, {
        companyName: companyName || 'Azienda Partner',
        description: description || '',
        faqs: faqs || [],
        url: url || '',
        updatedAt: new Date()
    });

    console.log(`[TRAIN] Bot ${botId} successfully updated with new knowledge.`);
    return res.status(200).json({ success: true, message: 'Chatbot trained successfully.' });
});

/**
 * STREAMING_CHUNK:Defining AI Chat Endpoint with Context Injection and Lead Qualification...
 */
// Main chat endpoint called by the embeddable widget
app.post('/api/chat', async (req, res) => {
    try {
        const { botId, messages, visitorInfo } = req.body;

        if (!botId || !messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Invalid payload. botId and messages array are required.' });
        }

        // Retrieve specific knowledge base for this bot, or fallback to default
        const kb = knowledgeBases.get(botId) || {
            companyName: 'Smart Lead Partner',
            description: 'Assistente virtuale avanzato per la qualificazione dei lead e supporto clienti.',
            faqs: [
                { q: "Quali sono i vostri orari?", a: "Siamo operativi dal lunedì al venerdì dalle 09:00 alle 18:00." },
                { q: "Come posso richiedere un preventivo?", a: "Puoi lasciarci la tua email o numero di telefono qui in chat e verrai ricontattato in meno di 2 ore lavorative." }
            ]
        };

        // Construct dynamic system prompt injecting the company knowledge (RAG simulation)
        const systemPrompt = `
Sei un assistente virtuale di vendita, supporto e qualificazione lead di livello professionale per l'azienda: "${kb.companyName}".
Informazioni sull'azienda: ${kb.description}
Domande frequenti (FAQ): ${JSON.stringify(kb.faqs)}

Il tuo obiettivo è:
1. Rispondere alle domande del visitatore basandoti rigorosamente sulle informazioni aziendali fornite.
2. Essere estremamente cortese, professionale, chiaro e conciso.
3. Raccogliere delicatamente i contatti del visitatore (Nome, Email, Telefono o esigenze specifiche) per poterli passare tempestivamente al team commerciale.
4. Se non conosci la risposta esatta, invita cordialmente il cliente a lasciare i propri recapiti per essere ricontattato al più presto da un operatore umano specializzato.
`;

        // Format conversation history for OpenAI Chat Completions API
        const formattedMessages = [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({
                role: m.sender === 'user' ? 'user' : 'assistant',
                content: m.text
            }))
        ];

        // Call OpenAI GPT-4o-mini API
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: formattedMessages,
            temperature: 0.7,
            max_tokens: 500,
        });

        const reply = completion.choices[0].message.content;

        // Check if visitor message or info indicates lead capture (email pattern matching)
        const lastUserMessage = messages.filter(m => m.sender === 'user').pop()?.text || '';
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
        const leadCaptured = (visitorInfo && visitorInfo.email) || emailRegex.test(lastUserMessage);

        return res.status(200).json({
            reply,
            leadCaptured,
            usage: completion.usage
        });

    } catch (error) {
        console.error('[CHAT ERROR]:', error);
        return res.status(500).json({ 
            error: 'Errore interno del server durante la generazione della risposta AI.',
            details: error.message 
        });
    }
});

/**
 * STREAMING_CHUNK:Starting the Server...
 */
app.listen(port, () => {
    console.log(`Smart Lead AI Backend running on port ${port}`);
});
