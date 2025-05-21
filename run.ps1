# Build Vue app
cd client
npm run build
cd ..

# Remove old dist folder
if (Test-Path dist) { Remove-Item -Recurse -Force dist }

# Copy files
New-Item -ItemType Directory -Path dist | Out-Null
Copy-Item -Recurse -Force client\dist\* dist\

# Run Flask
python app.py