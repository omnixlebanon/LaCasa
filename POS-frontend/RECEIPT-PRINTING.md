# Receipt printing on the cashier PC

Checkout starts printing automatically after the sale is saved, unless No print is selected. The exchange-rate line is omitted; totals and cash change still use the saved rate. Receipts can be reprinted from Order History. Printing does not charge a customer again.

A normal browser shows its print dialog. For automatic printing without confirmation on a Windows cashier PC, use the supplied Edge launcher:

1. Install the receipt printer in Windows, make it the default printer, and set its correct paper size.
2. From the repository root, run this once with your actual POS URL:
   `powershell -File .\POS-frontend\scripts\start-receipt-printing.ps1 -AppUrl "https://YOUR-SITE/POS/" -Setup`
   Replace the URL with your website's `/POS/` address (with no spaces).
3. Sign in, open an existing receipt from Order History, select 58 mm or 80 mm, and click Print receipt. Choose the physical receipt printer (not Save as PDF), set matching paper size, and disable browser headers/footers. Print a test receipt.
4. Close all windows of this dedicated La Casa browser. Run the same command without `-Setup` for everyday use. Edge's `--kiosk-printing` option auto-accepts printing with the configured destination.

The launcher uses a separate Edge profile in Local AppData, so ordinary browser windows are unaffected. Sign in and prepare offline data in this profile before using it offline. Close it before switching between Setup and normal modes. Paper size chosen in the receipt preview is remembered on this device. Browser printing cannot confirm that paper physically came out; if the printer is disconnected, check the Windows print queue and reprint from History when needed.

Chromium implementation: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/ui/webui/print_preview/print_preview_handler.cc

Edge launcher example: https://learn.microsoft.com/en-nz/answers/questions/2377892/kiosk-printing-in-edge-site-app
