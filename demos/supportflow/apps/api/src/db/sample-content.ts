/**
 * Help-centre articles for a FICTIONAL coffee roaster, "Larkspur Coffee Roasters".
 * Used by the public demo workspace and the development seed only.
 */
export const SAMPLE_BUSINESS = "Larkspur Coffee Roasters";

export const SAMPLE_ARTICLES: { category: string; title: string; body: string }[] = [
  {
    category: "Orders & shipping",
    title: "Shipping times and costs",
    body: `We roast on Mondays, Wednesdays and Fridays and ship within one business day of roasting.

## Delivery times
- UK: 1–2 business days with Royal Mail Tracked 48.
- Europe: 3–5 business days.
- Rest of the world: 5–10 business days.

## Costs
UK shipping is £3.50, and free on orders over £30. European shipping is £7.50. International shipping is calculated at checkout.

## Tracking
You get an email with a tracking link as soon as your parcel leaves the roastery.`,
  },
  {
    category: "Orders & shipping",
    title: "Changing or cancelling an order",
    body: `You can change the delivery address or swap a coffee until we start roasting your order. Orders placed before 9am go into that day's roast.

To change or cancel an order, reply in this chat with your order number. A member of the team will make the change for you; the assistant can't edit orders itself.

Once an order has shipped it can't be cancelled, but unopened bags can be returned (see "Returns and refunds").`,
  },
  {
    category: "Orders & shipping",
    title: "Returns and refunds",
    body: `Unopened bags can be returned within 30 days of delivery for a full refund. Opened coffee can't be returned, but if you're unhappy with a roast, tell us and we'll make it right.

Damaged equipment must be reported within 14 days with a photo of the damage.

Refunds go back to the original payment method within 5–7 business days after we receive the return. Refunds are always handled by a person on our team.`,
  },
  {
    category: "Subscriptions",
    title: "How coffee subscriptions work",
    body: `Choose a coffee, a bag size (250g or 1kg) and a frequency (every 1, 2 or 4 weeks). Subscribers save 10% on every bag and shipping is free in the UK.

## Pausing and skipping
You can pause, skip a delivery or change your coffee from your account page at any time before the next roast date. Changes made after the roast date apply to the following delivery.

## Cancelling
You can cancel a subscription from your account page; there is no minimum term.`,
  },
  {
    category: "Coffee & brewing",
    title: "Grind sizes",
    body: `Every coffee is available as whole bean or ground for espresso, moka pot, filter (V60, Chemex, machine), AeroPress or cafetière (French press).

Whole beans stay fresh longest. If you buy ground coffee, use it within two weeks of opening.`,
  },
  {
    category: "Coffee & brewing",
    title: "Storing your coffee",
    body: `Keep coffee in its resealable bag or an airtight container, away from light, heat and moisture. Don't store coffee in the fridge: it absorbs moisture and odours.

Coffee tastes best between 7 and 30 days after its roast date, which is printed on every bag.`,
  },
  {
    category: "Wholesale",
    title: "Wholesale for cafés and offices",
    body: `We supply cafés, restaurants and offices across the UK. Wholesale accounts get volume pricing from 5kg per week, barista training, and equipment servicing.

To apply, ask in this chat and a member of the wholesale team will contact you.`,
  },
];

export const SAMPLE_GREETING = "Hi! I'm the Larkspur assistant. Ask about orders, shipping, subscriptions or brewing.";
