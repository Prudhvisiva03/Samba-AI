async function test() {
  const res = await fetch('https://text.pollinations.ai/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'Who are you and what model are you?' }],
      model: 'openai'
    })
  });
  console.log('OpenAI:', await res.text());

  const res2 = await fetch('https://text.pollinations.ai/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'Who are you and what model are you?' }],
      model: 'claude'
    })
  });
  console.log('Claude:', await res2.text());
}
test();
