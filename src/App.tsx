import { HashRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import CourseSelection from "./Pages/CourseSelection";
import { PreferencesProvider } from "./context/PreferencesContext";
import Auth0ProviderWithConfig from "./auth/Auth0ProviderWithConfig";
import AuthGate from "./auth/AuthGate";

const App = () => {
  return (
    <PreferencesProvider>
      <Auth0ProviderWithConfig>
        <Router>
          <AuthGate>
            <Routes>
              <Route path="/CourseSelection" element={<CourseSelection />} />
              {/* Everything else (e.g. LoginPage's post-login "/home", or the
                  tree's "Continue" to "/review") lands back on the tree. */}
              <Route path="*" element={<Navigate to="/CourseSelection" replace />} />
            </Routes>
          </AuthGate>
        </Router>
      </Auth0ProviderWithConfig>
    </PreferencesProvider>
  );
};

export default App;
