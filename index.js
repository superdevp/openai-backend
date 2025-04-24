const express = require('express');
const axios = require('axios');
const cors = require('cors');
const OpenAI = require('openai');
const bodyParser = require('body-parser');
const app = express();
app.use(cors());
app.use(express.json());
require('dotenv').config();

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded())

// parse application/json
app.use(bodyParser.json())

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

async function getLatestNpmVersion(packageName) {
  const { data } = await axios.get(`https://registry.npmjs.org/${packageName}`);
  return data['dist-tags']?.latest || 'Unknown';
}

async function getCryptoPrice(symbol = 'bitcoin') {
  const { data } = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${symbol}&vs_currencies=usd`);
  return data[symbol]?.usd || 'Unknown';
}

async function getLatestGitHubRelease(owner, repo) {
  const { data } = await axios.get(`https://api.github.com/repos/${owner}/${repo}/releases/latest`);
  return `Latest release: ${data.name} (${data.tag_name}) - ${data.html_url}`;
}



app.post('/ask', async (req, res) => {
  const messages = req.body.messages;

  const tools = [
    {
      type: "function",
      function: {
        name: "getLatestNpmVersion",
        description: "Gets the latest version of an NPM package",
        parameters: {
          type: "object",
          properties: {
            packageName: { type: "string", description: "e.g., react, vue, tailwindcss" }
          },
          required: ["packageName"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "getLatestNews",
        description: "Gets the latest global news headlines",
        parameters: {
          type: "object",
          properties: {
            topic: { type: "string", description: "e.g., tech, finance, sports (optional)" }
          },
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "getLatestGitHubRelease",
        description: "Gets the latest release of a GitHub repo",
        parameters: {
          type: "object",
          properties: {
            owner: { type: "string", description: "GitHub username or org" },
            repo: { type: "string", description: "Repository name" }
          },
          required: ["owner", "repo"]
        }
      }
    }
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4-turbo",
    messages: messages,
    tools,
    tool_choice: "auto"
  });

  const toolCall = response.choices[0].message.tool_calls?.[0];
  
  if (toolCall) {
    const args = JSON.parse(toolCall.function.arguments);
    let result;

    switch (toolCall.function.name) {
      case "getLatestNpmVersion":
        result = await getLatestNpmVersion(args.packageName);
        break;
      case "getCryptoPrice":
        result = await getCryptoPrice(args.symbol.toLowerCase());
        break;
      case "getLatestGitHubRelease":
        result = await getLatestGitHubRelease(args.owner, args.repo);
        break;
      default:
        result = "Unknown tool call.";
    }

    const followup = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        { role: "system", content: "You are a smart assistant that uses real-time data." },
        { role: "user", content: messages[messages.length - 1].content },
        { role: "assistant", content: null, tool_calls: [toolCall] },
        { role: "tool", tool_call_id: toolCall.id, name: toolCall.function.name, content: JSON.stringify({ result }) }
      ]
    });

    return res.json({ reply: followup.choices[0].message.content });
  }

  return res.json({ reply: response.choices[0].message.content });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
