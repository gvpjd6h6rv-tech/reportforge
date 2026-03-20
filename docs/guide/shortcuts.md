# Keyboard Shortcuts — ReportForge v18.0

## Edit

| Action | Shortcut |
|--------|----------|
| Undo | Ctrl+Z |
| Redo | Ctrl+Y |
| Copy | Ctrl+C |
| Cut | Ctrl+X |
| Paste | Ctrl+V |
| Delete | Delete / Backspace |
| Duplicate | Ctrl+D |
| Select all | Ctrl+A |

## Movement

| Action | Shortcut |
|--------|----------|
| Move 1px | Arrow keys |
| Move 8px | Shift + Arrow |

## Zoom

| Action | Shortcut |
|--------|----------|
| Zoom in | Ctrl+B or Ctrl+= |
| Zoom out | Ctrl+Shift+B |
| Zoom reset (100%) | Ctrl+0 |
| Smooth zoom | Ctrl + Mouse Wheel (~10% per tick) |

## View

| Action | Shortcut |
|--------|----------|
| Toggle preview | F5 or Preview button |
| Toggle grid | Ctrl+G |
| Toggle snap | Ctrl+Shift+G |

## Format

| Action | Shortcut |
|--------|----------|
| Bold | Ctrl+B (text elements) |
| Italic | Ctrl+I |
| Underline | Ctrl+U |

## Notes

- Arrow key movement respects the snap grid (8px for Shift+Arrow, 1px for Arrow)
- Ctrl+Wheel zoom uses `DesignZoomEngine.setFree()` for smooth continuous zoom
- Buttons (+/−) use `DesignZoomEngine.set()` which snaps to predefined steps: 25%, 50%, 75%, 100%, 150%, 200%, 300%, 400%
- Preview and Design modes maintain independent zoom states — switching modes restores the previous zoom for that mode
