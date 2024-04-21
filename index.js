'use strict'

const fs = require('fs')
const config = require('config-yml')
const express = require('express')
const compression = require('compression')

const db = require('./db')
const themify = require('./utils/themify')

const PLACES = 7

const app = express()

app.use(express.static('assets'))
app.use(compression())
app.set('view engine', 'pug')
app.set('trust proxy', true)

app.get('/', (req, res) => {
  const site = config.app.site || `${req.protocol}://${req.get('host')}`
  res.render('index', { site })
});

// get the image
app.get('/get/@:name', async (req, res) => {
  let { name } = req.params;
  const rawName = name;
  name = decodeURIComponent(rawName);

  const { theme = 'moebooru' } = req.query
  let length = PLACES

  // This helps with GitHub's image cache 
  res.set({
    'content-type': 'image/svg+xml',
    'cache-control': 'max-age=0, no-cache, no-store, must-revalidate'
  })

  const data = await getCountByName(name)

  if (name === 'demo') {
    res.set({
      'cache-control': 'max-age=31536000'
    })
    length = 10
  }

  // Send the generated SVG as the result
  const renderSvg = themify.getCountImage({ count: data.num, theme, length })
  res.send(renderSvg)

  console.log(data, `theme: ${theme}`, `ref: ${req.get('Referrer') || null}`, `ua: ${req.get('User-Agent') || null}`, `ip: ${req.ip || null}`);
  writeToLogFile(`${formatCurrentTime()}[IMG] data: ${b64encode(data)}, theme: ${theme}, ref: ${req.get('Referrer') || null}, ua: ${b64encode(req.get('User-Agent')) || null}, ip: ${req.ip || null}`);
})

// JSON record
app.get('/record/@:name', async (req, res) => {
  let { name } = req.params;
  const rawName = name;
  name = decodeURIComponent(rawName);

  const data = await getCountByName(name);
  
  res.set({
    'Access-Control-Allow-Origin': '*'
  });

  res.json(data);
  console.log(data, `ref: ${req.get('Referrer') || null}`, `ua: ${req.get('User-Agent') || null}`, `ip: ${req.ip || null}`);
  writeToLogFile(`${formatCurrentTime()}[API] data: ${b64encode(data)}, ref: ${req.get('Referrer') || null}, ua: ${b64encode(req.get('User-Agent')) || null}, ip: ${req.ip || null}`);
})

app.get('/heart-beat', (req, res) => {
  res.set({
    'cache-control': 'max-age=0, no-cache, no-store, must-revalidate'
  })

  res.send('alive')
  console.log('heart-beat')
});

const listener = app.listen(config.app.port || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})

let __cache_counter = {}, shouldPush = false

setInterval(() => {
  shouldPush = true
}, 1000 * 10);

async function pushDB() {
  if (!shouldPush) return

  try {
    shouldPush = false
    if (Object.keys(__cache_counter).length === 0) return

    console.log("pushDB", __cache_counter)

    const counters = Object.keys(__cache_counter).map(key => {
      return {
        name: key,
        num: __cache_counter[key]
      }
    })

    await db.setNumMulti(counters)
    __cache_counter = {}
  } catch (error) {
    console.log("pushDB is error: ", error)
  }
}

async function getCountByName(name) {
  const defaultCount = { name, num: 0 }

  if (name === 'demo') return { name, num: '0123456789' }

  try {
    if (!(name in __cache_counter)) {
      const counter = await db.getNum(name) || defaultCount
      __cache_counter[name] = counter.num + 1
    } else {
      __cache_counter[name]++
    }

    pushDB()

    return { name, num: __cache_counter[name] }

  } catch (error) {
    console.log("get count by name is error: ", error)
    return defaultCount

  }
}


function writeToLogFile(message, logFilePath = 'access.log') {
  fs.appendFile(logFilePath, message + '\n', (err) => {
    if (err) {
      console.error('Error writing to log file:', err);
    }
  });
}

function b64encode(str) {
  return btoa((encodeURIComponent(str)));
}

function formatCurrentTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
  const formattedTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
  return formattedTime;
}