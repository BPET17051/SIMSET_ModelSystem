# 🧠 Brainstorm & Plan: E-Commerce Borrow UI (PLAN-ecommerce-borrow)

## Context
The current `borrow.html` system forces users to select a Start and End date before they can even see the catalog of available manikins. The current catalog grid text-heavy and lacks product images. The goal is to redesign this into a premium, e-commerce-like shopping experience (similar to Laerdal) where users can easily browse, see high-quality images, and "Add to Cart" with minimal friction.

---

## 💡 Brainstorming: Date Selection UX (The Core Challenge)
In e-commerce, you buy items immediately. In borrowing, availability depends strictly on the **Dates**. How should we handle date selection while keeping the e-commerce feel?

### Option A: The "Airbnb" Model (Global Date Bar)
Users see a prominent horizontal bar at the top to select their dates. Once selected, the grid below updates to show ONLY available items.
✅ **Pros:** Prevents user frustration (won't see unavailable items). Familiar booking pattern. Gives full width to the product grid (sidebar can be removed).
❌ **Cons:** Still requires date input before knowing if what they want is available.
📊 **Effort:** Medium

### Option B: The "Browse First, Dates Later" Model
Users can browse the entire catalog of manikins immediately without entering dates. When they click an item to view details or click "Add to Cart", a calendar modal pops up to check availability for their desired dates.
✅ **Pros:** Maximum exploration. Looks exactly like a standard e-commerce store. Low friction to start browsing.
❌ **Cons:** User might fall in love with a manikin only to discover it's booked for their dates.
📊 **Effort:** High (Requires overriding how the availability map is calculated per item).

### Option C: The "Hybrid" Model (Recommended)
Show the full catalog immediately. Have an optional "Filter by Date" top-bar. If users haven't selected a date, the "Add to Cart" button simply opens a quick "Select Dates" drawer/modal.
✅ **Pros:** Best of both worlds. Immediate visual impact, but still handles the date requirement gracefully.
❌ **Cons:** Requires slight modifications to the `borrow.js` state management.
📊 **Effort:** Medium-High

---

## 🎨 Design Commitment (Anti-Safe Harbor)
- **Topological Choice:** Move away from the generic "Sidebar + Grid" layout. We will use a **Full-Width Header Grid** with category "Pills" (Everything, Adult, Child, Infant) at the top, giving 100% focus to the high-quality product images.
- **Visual Depth:** Modern e-commerce cards with soft, elevated shadows on hover, and an image-first hierarchy.
- **Palette:** Clean Medical White/Light Gray background. High contrast CTAs (Call to Actions). **NO PURPLE.**
- **Cliché Liquidation:** Killing the tiny `+` and `-` buttons in the grid. Replacing them with a bold, satisfying **"Add to Cart / จองอุปกรณ์"** button that mirrors modern shopping carts.

---

## 📋 Task Breakdown (Execution Plan)

### Phase 1: UI Restructure (frontend-specialist)
- [ ] Refactor `borrow.html` to remove the left sidebar and implement a top-horizontal navigation for Categories (Pills) and Date Selection.
- [ ] Add a prominent Search Bar in the navigation area.
- [ ] Update `.product-card` CSS in `borrow.css` to an image-centric e-commerce design (using placeholders if actual images are missing).
- [ ] Replace `+` / `-` buttons on the catalog page with an "Add to Cart" button that opens the Quick Detail Drawer or adjusts quantity.

### Phase 2: Logic Updates (backend-specialist / frontend-specialist)
- [ ] Modify `borrow.js` to load and display all equipments on initial load (ignoring dates if Option B/C is chosen).
- [ ] Adjust `calculateAvailability` to work selectively or globally based on the chosen UX flow.
- [ ] Update the Quick Detail Drawer (`detail-drawer`) to look like an E-Commerce "Product Detail" page (larger image, clear availability calendar, descriptive text).

### Phase 3: Polish & "Wow" Factor
- [ ] Add a clean slide-up or fade-in animation for product cards.
- [ ] Add a floating "Cart" summary at the bottom or top right that updates dynamically (like Shopify).
- [ ] Ensure Mobile Responsiveness is flawless (Touch-friendly Add to Cart buttons).

---

## ✅ PHASE X: Verification
- [ ] Run `python .agent/scripts/ux_audit.py website`
- [ ] Run `python .agent/scripts/checklist.py website`
- [ ] Verify standard user flow: Browse -> Select Date -> Add to Cart -> Checkout.
- [ ] No Purple/Violet hex codes used.

---
**Next Steps:** Please review the brainstorm options (A, B, or C) for the Date Selection UX. Which direction would you like to proceed with?
