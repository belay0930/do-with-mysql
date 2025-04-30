# OnlyOffice Web Application

A web application for viewing, editing, and creating Office documents (Word, Excel, PowerPoint) directly in the browser.

## Features

- Document viewing and editing for Word, Excel, and PowerPoint files
- Document creation with customizable templates
- File management system (upload, organize, delete)
- Real-time collaboration capabilities
- Version history and document recovery
- User authentication and permission controls
- Responsive design for all devices
- Docker configuration for seamless deployment

## Requirements

- Node.js 14.x or higher
- MongoDB 4.x or higher
- OnlyOffice Document Server 7.x

## Quick Start with Docker

The easiest way to get started is using Docker Compose:

```bash
# Clone the repository
git clone <repository-url>
cd onlyoffice-web-app

# Configure environment variables
cp .env.example .env
# Edit .env as needed

# Start the services with Docker Compose
docker-compose up -d
```

The application will be available at http://localhost:3000.
The OnlyOffice Document Server will be accessible at http://localhost:8000.

## Manual Setup

If you prefer to run the application without Docker:

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables:

```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Start the application:

```bash
npm start
```

4. You'll also need to set up:
   - MongoDB database
   - OnlyOffice Document Server (can be hosted locally or use a cloud instance)

## Development

For development with auto-reloading:

```bash
npm run dev
```

## Folder Structure

```
├── src/                  # Application source code
│   ├── config/           # Configuration files
│   ├── controllers/      # Request handlers
│   ├── middleware/       # Custom middleware
│   ├── models/           # Mongoose models
│   ├── public/           # Static files
│   ├── routes/           # Application routes
│   ├── views/            # EJS templates
│   └── index.js          # Application entry point
├── uploads/              # Document storage
├── docker-compose.yml    # Docker Compose configuration
├── Dockerfile            # Docker configuration
└── package.json          # Project dependencies
```

## License

MIT# document-editor
