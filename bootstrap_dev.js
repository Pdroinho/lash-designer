
async function run() {
  try {
    const res = await fetch('http://localhost:3000/api/dev/bootstrap', {
      method: 'POST',
      headers: { 'Host': 'dev.localhost', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dev@test.com', password: 'password123' })
    })
    console.log('Status:', res.status)
    const text = await res.text()
    console.log('Body:', text)
  } catch (e) {
    console.error('Error:', e.message)
  }
}
run()
