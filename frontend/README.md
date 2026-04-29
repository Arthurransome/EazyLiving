# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.


## Next Steps

Page	Route	What it should do
TenantDashboard	/tenant/dashboard	Current lease, next rent, notifications, open maintenance
TenantLease	/tenant/lease	Lease details (unit, term, rent, deposit)
TenantPayments	/tenant/payments	Payment history + pay rent dialog
TenantMaintenance	/tenant/maintenance	Submit requests + status timeline
ManagerDashboard	/manager/dashboard	KPIs + maintenance queue + recent payments
ManagerProperties	/manager/properties	Property list + unit management + lease assignment
ManagerMaintenance	/manager/maintenance	Cross-property queue + technician assignment
OwnerDashboard	/owner/dashboard	Portfolio KPIs + revenue/occupancy charts
OwnerProperties	/owner/properties	Read-only property drill-down
NotificationsPage	/notifications	User notifications list
ProfilePage	/profile	Edit name/email + change password

A logical order would be: TenantDashboard → TenantPayments → TenantMaintenance → ManagerDashboard → OwnerDashboard, since those cover the most used flows first.