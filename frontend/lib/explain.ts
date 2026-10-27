// Plain-language explanations shared by the home page, the Help page and the "?" buttons.

export const GLOSSARY: { term: string; meaning: string }[] = [
  { term: "Prompt", meaning: "The instructions you give an AI, for example \"Summarize this complaint in one sentence.\"" },
  { term: "Input", meaning: "The text the prompt works on, for example one customer email. Write {{input}} in your prompt to mark where it goes." },
  { term: "Model", meaning: "A specific AI that answers your prompt, such as Gemini, GPT or Llama. Different models give different answers at different speeds and prices." },
  { term: "Grader", meaning: "A second AI that reads each answer and scores it from 1 to 10, with a short reason. It saves you from reading every answer yourself." },
  { term: "Ideal answer", meaning: "What a perfect answer looks like, if you know it. Giving one makes grading much more accurate." },
  { term: "Pass mark", meaning: "The lowest score that counts as a good answer. It is 7 out of 10 by default." },
  { term: "Dataset", meaning: "A list of test inputs, such as 30 real customer emails, saved so you can reuse it every time you change your prompt." },
  { term: "Regression", meaning: "Something that used to work but broke after a change. This app lists exactly which answers got better and which got worse." },
  { term: "Tokens", meaning: "The small chunks of text that AI providers count and charge for. 100 tokens is roughly 75 English words." },
];

export const FAQ: { q: string; a: string }[] = [
  { q: "Do I need to know how to code?", a: "No. If you can write instructions for an AI, you can use this. Type a prompt, pick some AIs, and press Run." },
  { q: "Is it free?", a: "It can be. Free AI options (Google Gemini, Groq, OpenRouter's free models and Ollama on your own computer) are marked \"free\". Paid models show their price, and every result shows what it cost." },
  { q: "Which AI should I use?", a: "That's exactly what this tool helps you decide. Run the same prompt on two or three models and compare the grades, speed and cost side by side." },
  { q: "Why should I test many inputs instead of one?", a: "One good answer can be luck. Testing 10 to 30 realistic inputs shows how a prompt behaves in general, including the awkward cases." },
  { q: "Why did a grade change when I changed nothing?", a: "The grader is an AI too, and it isn't perfectly consistent. One answer moving a point or two is normal. Look for patterns across several answers." },
  { q: "Is my data safe?", a: "Your inputs are sent to the AI providers you pick. Some free tiers may use what you send to improve their models, so use made-up or anonymised examples there, or Ollama, which never leaves your computer." },
  { q: "Are quick tests saved?", a: "No. Quick tests are for trying ideas. Use \"Evaluate many inputs\" when you want results saved and compared over time." },
];
