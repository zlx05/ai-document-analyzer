import app from './src/app.js';

const port = Number(process.env.PORT || 3000);

app.listen(port, () => {
  console.log(`AI knowledge agent running at http://127.0.0.1:${port}`);
});
