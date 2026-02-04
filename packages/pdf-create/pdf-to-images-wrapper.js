#!/usr/bin/env node
/**
 * NPM wrapper for pdf-to-images.py that properly handles argument parsing
 */

const { spawn } = require('child_process');
const path = require('path');

function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: npm run pdf-to-images <pdf-path> --output <output-path> [options]');
        console.log('');
        console.log('Options:');
        console.log('  --output, -o <path>     Output directory for images (required)');
        console.log('  --dpi <number>          DPI for rendering (default: 150)');
        console.log('  --max-width <number>    Maximum width in pixels (default: 1200)');
        console.log('  --quality <number>      JPEG quality 1-100 (default: 85)');
        console.log('  --format <JPEG|PNG>     Output format (default: JPEG)');
        console.log('  --prefix <string>       Filename prefix (default: page)');
        console.log('  --start-page <number>   First page to convert (1-indexed)');
        console.log('  --end-page <number>     Last page to convert (1-indexed)');
        console.log('');
        console.log('Examples:');
        console.log('  npm run pdf-to-images book.pdf --output preview-images');
        console.log('  npm run pdf-to-images "/path/to/file.pdf" --output "/path/to/images"');
        process.exit(1);
    }

    // Parse arguments properly - handle missing --output flag
    const pythonArgs = ['python', 'pdf-to-images.py'];
    
    // First argument should be the PDF path
    if (args.length > 0 && !args[0].startsWith('-')) {
        pythonArgs.push(args[0]);
        
        // If there's a second argument that doesn't start with --, assume it's the output path
        if (args.length > 1 && !args[1].startsWith('-')) {
            pythonArgs.push('--output');
            pythonArgs.push(args[1]);
            
            // Add any remaining arguments
            for (let i = 2; i < args.length; i++) {
                pythonArgs.push(args[i]);
            }
        } else {
            // Process remaining arguments normally
            for (let i = 1; i < args.length; i++) {
                pythonArgs.push(args[i]);
            }
        }
    } else {
        console.error('Error: First argument must be the PDF file path');
        process.exit(1);
    }

    // Execute the UV command
    const child = spawn('uv', ['run', ...pythonArgs], {
        stdio: 'inherit',
        cwd: __dirname
    });

    child.on('close', (code) => {
        process.exit(code);
    });

    child.on('error', (err) => {
        console.error('Failed to start process:', err);
        process.exit(1);
    });
}

if (require.main === module) {
    main();
}