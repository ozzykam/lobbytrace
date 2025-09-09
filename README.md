# LobbyTrace - Coffee Shop Inventory & Receipt Scanner App

A comprehensive Angular + Firebase application for coffee shop inventory management, recipe tracking, order processing, and receipt scanning with OCR capabilities.

## ⚙️ Setup Instructions

### Prerequisites
- Node.js (v18 or later)
- Angular CLI (`npm install -g @angular/cli`)
- Firebase CLI (`npm install -g firebase-tools`)

### 1. Environment Configuration
Before running the application, you need to set up Firebase configuration:

1. Copy the example environment files:
   ```bash
   cp src/environments/environment.example.ts src/environments/environment.ts
   cp src/environments/environment.prod.example.ts src/environments/environment.prod.ts
   ```

2. Replace the placeholder values in both files with your actual Firebase project credentials:
   - Get your Firebase config from [Firebase Console](https://console.firebase.google.com)
   - Go to Project Settings > General > Your apps > SDK setup and configuration
   - Copy the config values and replace the placeholders

3. **Important**: Never commit the actual environment files - they contain sensitive API keys and are ignored by git.

### 2. Install Dependencies
```bash
# Install frontend dependencies
npm install

# Install Firebase Functions dependencies
cd functions && npm install && cd ..
```

## 🚀 Development

### Frontend Development Server
To start the Angular development server:

```bash
ng serve
```

Navigate to `http://localhost:4200/`. The application will automatically reload when you change source files.

### Firebase Functions Development
To develop and test Firebase Functions locally:

```bash
cd functions
npm run serve  # Starts Firebase emulator
```

### Firebase Emulator Suite (Optional)
To run the full Firebase emulator suite for local development:

```bash
firebase emulators:start
```

This will start emulators for Firestore, Functions, Hosting, and other Firebase services.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## 🏗️ Building & Deployment

### Frontend Build
To build the Angular project:

```bash
ng build
```

This compiles the project to `dist/` directory. For production build:

```bash
ng build --configuration production
```

### Firebase Functions Build
To build Firebase Functions:

```bash
cd functions
npm run build
```

This compiles TypeScript to JavaScript in the `functions/lib/` directory.

### Deploy to Firebase
```bash
# Deploy everything
firebase deploy

# Deploy only functions
firebase deploy --only functions

# Deploy only hosting
firebase deploy --only hosting
```

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## 📁 Project Structure

```
lobbytrace/
├── src/                          # Angular frontend application
│   ├── app/                      # Angular components, services, etc.
│   └── environments/             # Environment configs (gitignored)
├── functions/                    # Firebase Cloud Functions (backend)
│   ├── src/                      # TypeScript source code
│   ├── lib/                      # Compiled JavaScript (auto-generated)
│   └── package.json              # Backend dependencies
├── firebase.json                 # Firebase project configuration
├── firestore.rules              # Database security rules
└── package.json                 # Frontend dependencies
```

## 🛡️ Security Notes

- Environment files containing Firebase API keys are gitignored for security
- Use example files to set up your local environment
- Never commit actual Firebase credentials to version control
- Firestore security rules are currently in development mode (expires Oct 6, 2025)

## ☕ Features

- **Inventory Management**: Track coffee shop inventory items
- **Product Management**: Manage products and their ingredient requirements
- **Order Processing**: Handle customer orders with automatic inventory deduction
- **Receipt Scanner**: OCR-powered receipt scanning and expense tracking
- **Task Management**: Staff task assignment and tracking
- **Analytics Dashboard**: Business insights and forecasting

## 🔗 Additional Resources

- [Angular CLI Documentation](https://angular.dev/tools/cli)
- [Firebase Documentation](https://firebase.google.com/docs)
- [AngularFire Documentation](https://github.com/angular/angularfire)
