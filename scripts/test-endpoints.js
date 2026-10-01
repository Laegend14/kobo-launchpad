async function test() {
  try {
    const configRes = await fetch('http://localhost:3000/api/config');
    const config = await configRes.json();
    console.log('✅ Config API:', config);

    const bundleRes = await fetch('http://localhost:3000/dynamic-bundle.js');
    console.log('✅ Dynamic Bundle HTTP Status:', bundleRes.status, 'Size:', (await bundleRes.arrayBuffer()).byteLength);

    const htmlRes = await fetch('http://localhost:3000/');
    const html = await htmlRes.text();
    console.log('✅ HTML includes dynamic-bundle.js:', html.includes('dynamic-bundle.js'));
    console.log('✅ HTML includes paystack v2:', html.includes('js.paystack.co/v2/inline.js'));
    console.log('✅ HTML includes paystackModal:', html.includes('id="paystackModal"'));
    console.log('✅ HTML includes dynamic-widget-root:', html.includes('id="dynamic-widget-root"'));
    console.log('✅ HTML includes btnPayWithPaystack:', html.includes('id="btnPayWithPaystack"'));
    console.log('✅ HTML includes btnClaimFaucet:', html.includes('id="btnClaimFaucet"'));

    // Test faucet endpoint
    const faucetRes = await fetch('http://localhost:3000/api/faucet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: '0x959C2c33419b009ce02113BFAee45d4ae72981f8' })
    });
    console.log('✅ Faucet API response:', await faucetRes.json());
  } catch (err) {
    console.error('❌ Test failed:', err);
  }
}

test();
