const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>DevSecOps Login</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background: #f4f6f8;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
          }
          .login-box {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
            width: 300px;
          }
          h1 {
            text-align: center;
            margin-bottom: 20px;
          }
          input {
            width: 100%;
            padding: 10px;
            margin: 10px 0;
          }
          button {
            width: 100%;
            padding: 10px;
            background: #007bff;
            color: white;
            border: none;
            cursor: pointer;
          }
        </style>
      </head>
      <body>
        <div class="login-box">
          <h1>DevSecOps Login Page</h1>
          <form>
            <input type="text" id="username" placeholder="Username" />
            <input type="password" id="password" placeholder="Password" />
            <button type="submit">Login</button>
          </form>
        </div>
      </body>
    </html>
  `);
});

app.listen(80, () => console.log('Listening on port 80'));

