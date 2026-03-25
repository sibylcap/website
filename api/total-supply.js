export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send('1000000000');
}
