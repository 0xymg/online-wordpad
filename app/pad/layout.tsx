// The editor's font-family dropdown offers these Google Fonts, so they are
// loaded only on /pad — the landing and guide pages don't pay for them.
// React 19 hoists these <link> elements into <head>.
const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Roboto:ital,wght@0,400;0,700;1,400&family=Open+Sans:ital,wght@0,400;0,700;1,400&family=Lato:ital,wght@0,400;0,700;1,400&family=Montserrat:ital,wght@0,400;0,700;1,400&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Merriweather:ital,wght@0,400;0,700;1,400&family=Source+Code+Pro:wght@400;700&family=Raleway:ital,wght@0,400;0,700;1,400&family=Nunito:ital,wght@0,400;0,700;1,400&family=Poppins:ital,wght@0,400;0,700;1,400&family=PT+Serif:ital,wght@0,400;0,700;1,400&family=Libre+Baskerville:ital,wght@0,400;1,400&family=Josefin+Sans:ital,wght@0,400;0,700;1,400&family=Crimson+Text:ital,wght@0,400;0,600;1,400&family=Oswald:wght@400;700&family=Dancing+Script:wght@400;700&family=Pacifico&family=Lobster&family=Caveat:wght@400;700&display=swap";

export default function PadLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" precedence="default" href={GOOGLE_FONTS_HREF} />
      {children}
    </>
  );
}
