import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AdminGuard } from './components/AdminGuard'
import { AdminLoginPage } from './pages/AdminLoginPage'
import { AdminPage } from './pages/AdminPage'
import { BoardPage } from './pages/BoardPage'
import { PublicHomePage } from './pages/PublicHomePage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicHomePage />} />
        <Route path="/board/:boardId" element={<BoardPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route
          path="/admin"
          element={
            <AdminGuard>
              <AdminPage />
            </AdminGuard>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
