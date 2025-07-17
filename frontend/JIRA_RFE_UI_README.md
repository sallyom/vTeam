# JIRA RFE Session Manager UI

This is a React-based UI for managing JIRA RFE (Request for Enhancement) sessions using PatternFly components.

## Features

### 🎯 Session Management
- **Create New Sessions**: Start processing a JIRA RFE by providing a JIRA key (e.g., RHOAI-1234)
- **Session List**: View all sessions with their status, current stage, and timestamps
- **Session Selection**: Click on any session to view its details
- **Auto-refresh**: Sessions automatically refresh every 5 seconds when running

### 📱 Split View Layout
The UI features a three-panel layout:

1. **Left Sidebar**: Collapsible session management panel
2. **Center Panel**: Chat session showing messages and MCP tool usage
3. **Right Panel**: Output files with tabbed interface for different stages

### 💬 Chat & Activity Panel
- **Messages**: View all messages between user and AI assistant
- **MCP Usage**: See which tools the AI is using and their input/output
- **Stage Filtering**: Filter by processing stage (refine, epics, jiras, estimate)
- **Real-time Updates**: Auto-refreshes every 3 seconds during active sessions

### 📄 Output Panel
- **Tabbed Interface**: Organized by processing stages
- **Markdown Rendering**: Full markdown support with GitHub Flavored Markdown
- **Stage Badges**: Visual indicators for each processing stage
- **File Management**: View all output files generated during processing

## UI Components

### Session Status Colors
- **Grey**: Pending - Session queued for processing
- **Blue**: Running - Currently being processed
- **Green**: Completed - Successfully finished
- **Red**: Failed - Error occurred during processing
- **Orange**: Cancelled - Session was cancelled

### Processing Stages
1. **Refine** (Blue) - Feature refinement and analysis
2. **Epics** (Orange) - Epic creation and breakdown
3. **JIRAs** (Green) - JIRA ticket creation
4. **Estimate** (Grey) - Effort estimation

## Setup and Development

### Prerequisites
- Node.js 18+ (Note: Some dependencies may show warnings with Node 18)
- npm or yarn

### Installation
```bash
cd frontend
npm install
```

### Development
```bash
npm run start:dev
```

### Build
```bash
npm run build
```

### Environment Configuration
The UI expects the API to be running on `http://localhost:8000` by default. You can override this by setting the `REACT_APP_API_URL` environment variable:

```bash
REACT_APP_API_URL=http://your-api-host:8000 npm run start:dev
```

## Usage

### Creating a New Session
1. Click the "New" button in the sidebar
2. Enter the JIRA key (e.g., RHOAI-1234)
3. Optionally enable "Soft Mode" for less strict processing
4. Click "Create Session"

### Viewing Session Details
1. Select a session from the sidebar
2. View real-time chat and activity in the center panel
3. Browse output files in the right panel using tabs
4. Filter messages by stage using the dropdown

### Managing Sessions
- **Delete**: Click the trash icon next to any session
- **Refresh**: Sessions auto-refresh, but you can manually refresh the page
- **Collapse Sidebar**: Click the arrow icon to collapse/expand the sidebar

## Technical Details

### Dependencies
- **React 18**: Modern React with hooks
- **PatternFly 6**: Enterprise-grade UI components
- **axios**: HTTP client for API communication
- **react-markdown**: Markdown rendering with GitHub Flavored Markdown support
- **TypeScript**: Type safety throughout the application

### API Integration
The UI communicates with the backend API through:
- REST endpoints for session management
- Real-time polling for updates
- Structured data types for type safety

### Responsive Design
- Mobile-friendly layout
- Collapsible sidebar for smaller screens
- Adaptive component sizing
- Accessibility features built-in

## Troubleshooting

### Common Issues

1. **API Connection Error**: 
   - Ensure the backend API is running on the correct port
   - Check the `REACT_APP_API_URL` environment variable

2. **Build Warnings**:
   - Node version warnings are expected with Node 18
   - Bundle size warnings are normal for PatternFly applications

3. **Session Not Loading**:
   - Check browser console for API errors
   - Verify the session ID is valid
   - Ensure the backend is processing the session

### Performance Notes
- Auto-refresh intervals are optimized for real-time updates
- Large markdown files are contained in scrollable areas
- Bundle size is optimized for production builds

## Architecture

The UI follows a component-based architecture:

```
src/
├── components/
│   ├── SessionSidebar.tsx     # Session management sidebar
│   ├── ChatPanel.tsx          # Chat and MCP usage display
│   ├── OutputPanel.tsx        # Markdown output with tabs
│   └── SessionManager.tsx     # Main layout coordinator
├── services/
│   └── api.ts                 # API service layer
├── types/
│   └── api.ts                 # TypeScript definitions
└── config.ts                  # Configuration management
```

This architecture ensures maintainability, type safety, and clear separation of concerns. 