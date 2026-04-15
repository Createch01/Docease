const url = 'https://medicalis.ma/recherchemedicament/A?page=1';
fetch(url, {
    headers: {
        'User-Agent': 'Mozilla/5.0'
    }
})
    .then(r => r.text())
    .then(text => {
        console.log(text.substring(0, 1000));
        // Save to a file to inspect
        require('fs').writeFileSync('test_page.html', text);
    })
    .catch(console.error);
