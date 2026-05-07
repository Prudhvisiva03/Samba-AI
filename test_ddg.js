const { chatWithFreeAI } = require('./server/services/freeAiService');

async function testDDG() {
  const res = await chatWithFreeAI('Hello, what model are you?', 'claude-3-haiku-20240307');
  console.log(res);
}

testDDG();
