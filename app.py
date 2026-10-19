from flask import flask

app = Flask(name)

@app.route('/')

def home():
    # return render_template('index.html')
    return 'Hellow World!'

if name == 'main':
    app.run()