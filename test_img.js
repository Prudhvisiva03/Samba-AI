async function testChat() {
  const cRes = await fetch('http://localhost:3000/api/chats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Test Chat' })
  });
  const chat = await cRes.json();
  
  const res = await fetch(`http://localhost:3000/api/chats/${chat.id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: 'generate an image of a futuristic city',
      model: 'smart-ai-1'
    })
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

testChat();
