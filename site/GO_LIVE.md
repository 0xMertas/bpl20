# WORLDX go-live plan (do these in order)

Stop and send a screenshot (or the exact error text) whenever a step does not match. Never type a seed phrase or private key anywhere.

## A. Finish the mint (UniSat inscribe page)

1. Open the Mint form: **brc2.0** selected, **Mint** selected, Tick `WORLDX`, Amount `21000000`, Repeat `1`.
2. Press **Suivant**. On the summary check: ticker WORLDX, amount 21000000, receiving address = your own wallet, fee reasonable. Then approve in UniSat.
3. Wait for 1 confirmation (mempool.space). In UniSat, open **BRC-20** (or the brc2.0 section) and check WORLDX shows 21,000,000.
   - If the mint is rejected or the balance stays 0, STOP and send me the screenshot.

## B. Test how a transfer works for WORLDX (this decides what the site needs)

4. In UniSat open WORLDX and look for **Inscribe Transfer** / **Transfer** (or use the inscribe page: brc2.0 -> **Transfer**).
5. Make ONE small test transfer (for example amount 1000). Wait for it to confirm.
6. Open that new inscription and copy its **content text**. Send it to me.
   - If the content looks like `{"p":"brc-20","op":"transfer","tick":"WORLDX","amt":"1000"}`, the site works as built: go to C.
   - If it looks different (other `p` or `op`), STOP and send it to me. I will adapt the site before you create lots.

## C. Create the lots

7. Check mempool.space for the fee rate. Make lots when it is about 2 sat/vB or lower.
8. Make N transfers of 1000 each (start with 5). Wait until each confirms.
9. Open the seller page `http://localhost:3000/admin.html` (server running: `cd C:\Users\Saad\worldx` then `npx serve .`).
10. Step 1 Connect. Step 2 **Load my newest inscriptions**: each new one must say `TRANSFER WORLDX 1000`. Tap them all. (Anything marked DEPLOY or "could not check" is refused: do not sell it.)
11. Step 3 choose the price. Step 4 **Sign lots & download lots.json**. Approve in UniSat.
12. Move the downloaded `lots.json` into `C:\Users\Saad\worldx` (replace the old one).

## D. Test one real claim

13. Open `http://localhost:3000/` (Ctrl+F5). You should see your lots.
14. In a second browser profile with a second UniSat wallet that holds about $10 of BTC in 2 separate coins, press **Claim**, check the total, approve.
15. Wait for confirmation. The second wallet must show 1,000 WORLDX, and your payout wallet must show the payment.
    - If it fails, STOP and send me the exact message.

## E. Publish

16. In PowerShell, make a clean folder and copy the files (one line at a time):
    ```
    cd C:\Users\Saad\worldx
    New-Item -ItemType Directory -Force C:\Users\Saad\worldx-publish
    Copy-Item index.html,admin.html,stats.html,style.css,config.json,lots.json C:\Users\Saad\worldx-publish
    Copy-Item js C:\Users\Saad\worldx-publish -Recurse -Force
    ```
17. Go to **app.netlify.com/drop** and drag the folder `C:\Users\Saad\worldx-publish` onto the page. Netlify gives you a link.
18. Open that link on your phone and on another computer. Lots must show, Connect must work.
19. Do NOT publish `admin.html`'s password-less seller page for the public: delete `admin.html` from the `worldx-publish` folder before uploading (buyers do not need it). Keep your own copy.

## F. Announce

20. Post: supply, how much you hold, lot size, price (development fee + transfer cost + network fee), and the official link. Pin "I will never DM first or ask for your seed phrase."
21. Add more lots as they sell: repeat C (make transfers, load, sign, new lots.json), then re-upload the folder to the same Netlify site.

## Notes

- Your PC can sleep or be off. The public site runs on Netlify. Only the seller page (`localhost:3000`) needs your PC, and only when you add lots.
- Never move or spend a lot's coin yourself while it is listed.
