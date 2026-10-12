# Portable local installation

1. Build the Swift helper from this repository with `swift build --product computer-use-mcp -c release`.
2. Place the resulting trusted helper at `bin/computer-use-mcp` beside the adapter build, or set `BACKGROUND_COMPUTER_USE_HELPER` to an explicit absolute path.
3. Run the adapter over stdio. Missing helpers fail closed; no download or PATH fallback occurs.
4. Grant Accessibility only to the signed helper/client that will run it, after review.

The HTTP transport is not implemented. This package does not open a listener.
