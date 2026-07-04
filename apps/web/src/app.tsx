import { Route, Router } from "@solidjs/router";
import { AppLayout } from "./layouts/app.tsx";
import { MarketingLayout } from "./layouts/marketing.tsx";
import { CharacterSheetPage } from "./pages/character-sheet.tsx";
import { CharactersPage } from "./pages/characters.tsx";
import { LandingPage } from "./pages/landing.tsx";

/**
 * Route surface (see issue #8): `/` belongs to a future landing page and
 * `/table/:id` to a future VTT, so the marketing shell and the app shell are
 * separate layouts from day one — each can grow its own chrome without a
 * routing rework.
 */
export function App() {
  return (
    <Router>
      <Route component={MarketingLayout}>
        <Route path="/" component={LandingPage} />
      </Route>
      <Route component={AppLayout}>
        <Route path="/characters" component={CharactersPage} />
        <Route path="/characters/:id" component={CharacterSheetPage} />
      </Route>
    </Router>
  );
}
