async function getModels() {
  const res = await fetch('https://text.pollinations.ai/models');
  const text = await res.text();
  console.log(text);
}
getModels();
