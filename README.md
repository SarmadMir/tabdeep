# TabDeep - Chrome Extension

A professional Chrome extension that provides detailed insights into browser history across all your synced devices, including tab-level visit tracking and access method analysis.

## Features

### Core Functionality
- **Current Device History**: View your local browsing history with date grouping and search functionality
- **Synced Device Access**: Browse history from all Chrome-synced devices in your account
- **Tab-Level Tracking**: Detailed visit history for individual tabs on all devices
- **Visit Method Analysis**: Shows how each page was accessed (clicked link, typed URL, search result, etc.)
- **Real-Time Sync Status**: Displays last sync times for each device

### User Interface
- **Dark/Light Theme**: Automatic theme detection with manual toggle option
- **Responsive Design**: Clean, modern interface optimized for readability
- **Smart Search**: Real-time filtering across devices and history
- **Collapsible Sections**: Organized display with expandable device/tab sections
- **Favicon Support**: Visual page identification with fallback icons

### Technical Features
- **Robust Error Handling**: Graceful handling of malformed URLs and network issues
- **Performance Optimized**: Efficient data loading and rendering
- **Chrome API Integration**: Full utilization of Sessions, History, and Tabs APIs
- **Cross-Device Synchronization**: Leverages Chrome's sync infrastructure

## Architecture

### Files Structure
```
Chrome Data Access/
├── manifest.json          # Extension configuration and permissions
├── background.js          # Service worker for extension lifecycle
├── popup.html/js          # Extension popup (redirects to main interface)
├── history.html           # Main application interface
├── history.js            # Core functionality and data processing
├── theme.js              # Theme management and persistence
└── icons/                # Extension icons and assets
```

### Key Components

#### 1. History Management (`history.js`)
- **Device Discovery**: Fetches synced devices using Chrome Sessions API
- **History Aggregation**: Collects browsing data from History API
- **Visit Analysis**: Processes visit transitions and timing data
- **Data Presentation**: Renders organized, searchable history views

#### 2. Cross-Device Synchronization
- **Device Detection**: Automatically discovers all Chrome-synced devices
- **Session Tracking**: Monitors active tabs and windows per device
- **Timestamp Correlation**: Matches local history with device sync times
- **Conflict Resolution**: Handles timezone and sync delay differences

#### 3. Visit Type Classification
The extension tracks and displays different access methods:
- **Link Navigation**: "Clicked a link" - User followed a hyperlink
- **Direct Access**: "Typed in address" - URL entered in address bar
- **Bookmark Access**: "Opened from bookmarks" - Accessed via bookmarks
- **Search Results**: "Search result" - Arrived via search engine
- **Form Submission**: "Form submitted" - Result of form interaction
- **Page Reload**: "Page reloaded" - Browser refresh action
- **System Generated**: Internal browser navigation

## Permissions & Privacy

### Required Permissions
- `sessions`: Access synced device information
- `history`: Read browsing history data  
- `tabs`: Monitor current tab states
- `favicon`: Display website icons
- `storage`: Store theme preferences
- `<all_urls>`: Favicon access across domains

### Privacy Considerations
- **Local Processing**: All data analysis occurs locally in the browser
- **No External Servers**: No data transmission to third-party services
- **Chrome Sync Only**: Leverages existing Chrome synchronization infrastructure
- **User Control**: Users control sync settings through Chrome's native interface

## Recent Bug Fixes & Improvements

### URI Malformed Error Resolution
- Added comprehensive URL validation in `getFaviconUrl()`
- Implemented multiple fallback layers for favicon loading
- Enhanced error handling in device and tab rendering processes
- Graceful degradation for invalid URLs

### Performance Enhancements
- Optimized async operations for better loading speeds
- Improved error boundaries to prevent cascading failures
- Enhanced memory management for large history datasets

## Technical Implementation

### Data Flow
1. **Extension Activation**: User clicks extension icon → Opens history.html
2. **Device Discovery**: Queries Chrome Sessions API for synced devices
3. **History Correlation**: Matches device sessions with local history data
4. **Visit Analysis**: Processes transition types and timing information
5. **UI Rendering**: Displays organized, searchable results

### Error Handling Strategy
- **URL Validation**: Multiple validation layers before processing
- **Favicon Fallbacks**: Progressive fallback from Chrome API to default icons
- **Graceful Failures**: Individual item failures don't break entire views
- **User Feedback**: Clear error messages for connectivity/sync issues

### Performance Optimizations
- **Lazy Loading**: Content loaded as sections are expanded
- **Search Debouncing**: 300ms delay prevents excessive filtering
- **Memory Management**: Efficient DOM manipulation and cleanup
- **Async Processing**: Non-blocking operations for better user experience

## Browser Compatibility
- Chrome 88+ (Manifest V3 requirement)
- Edge 88+ (Chromium-based)
- Optimized for desktop usage

## Development Notes

### Architecture Decisions
- **Manifest V3**: Future-proof extension format
- **Service Worker**: Background script using modern Chrome API
- **Vanilla JavaScript**: No external dependencies for performance
- **CSS Grid/Flexbox**: Modern layout techniques for responsive design

### Code Quality Features
- Comprehensive error handling throughout all functions
- Proper async/await patterns for API calls
- Modular function design for maintainability
- Consistent naming conventions and code structure

## Known Considerations

### Sync Dependencies
- Requires user to be signed into Chrome with sync enabled
- Device history availability depends on Chrome's sync policies
- History correlation limited by Chrome's sync timing

### Data Limitations
- Visit history limited to Chrome's retention policies
- Cross-device history subject to sync delays
- Some internal Chrome pages may not appear in results

## Future Enhancement Opportunities

1. **Export Functionality**: Allow users to export history data
2. **Advanced Filtering**: Date ranges, specific domains, visit counts
3. **Statistics Dashboard**: Usage patterns and insights
4. **Privacy Controls**: Fine-grained visibility settings
5. **Bookmark Integration**: Cross-reference with bookmark data

## Support & Troubleshooting

### Common Issues
- **No synced devices**: Ensure Chrome sync is enabled and user is signed in
- **Missing history**: Check Chrome's history retention settings
- **Loading errors**: Verify extension permissions are granted

### Performance Tips
- Use search functionality to filter large history sets
- Collapse unused device sections to improve scrolling
- Clear extension data if experiencing slow performance

---

*This extension provides detailed browser history analysis while maintaining user privacy through local-only data processing.*