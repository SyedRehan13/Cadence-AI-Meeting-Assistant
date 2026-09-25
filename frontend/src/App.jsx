import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import NewMeeting from './pages/NewMeeting.jsx'
import PastMeetings from './pages/PastMeetings.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Projects from './pages/Projects.jsx'
import Account from './pages/Account.jsx'
import EmployeeFollowups from './pages/EmployeeFollowups.jsx'
import FollowUps from './pages/FollowUps.jsx'
import WorkspaceLayout from './components/WorkspaceLayout.jsx'

function PrivateRoute({ children, pmOnly = false, employeeOnly = false }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="container">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  if (pmOnly && user.role !== 'pm') return <Navigate to="/dashboard" replace />
  if (employeeOnly && user.role !== 'employee') return <Navigate to="/dashboard" replace />
  return children
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <WorkspaceLayout>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
        <Route path="/signup" element={user ? <Navigate to="/dashboard" /> : <Signup />} />
        <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/past-meetings" element={<PrivateRoute><PastMeetings /></PrivateRoute>} />
        <Route path="/account" element={<PrivateRoute><Account /></PrivateRoute>} />
        <Route path="/follow-ups" element={<PrivateRoute pmOnly><FollowUps /></PrivateRoute>} />
        <Route path="/my-follow-ups" element={<PrivateRoute employeeOnly><EmployeeFollowups /></PrivateRoute>} />
        <Route path="/new-meeting" element={<PrivateRoute pmOnly><NewMeeting /></PrivateRoute>} />
        <Route path="/projects" element={<PrivateRoute pmOnly><Projects /></PrivateRoute>} />
        <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} />} />
      </Routes>
    </WorkspaceLayout>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
