
async function run() {
  try {
    const res = await fetch('http://localhost:3000/api/dev/tenants', {
      headers: { 'Host': 'dev.localhost' }
    })
    console.log('Status:', res.status)
    const text = await res.text()
    console.log('Body:', text)
  } catch (e) {
    console.error('Error:', e.message)
  }
}
run()
