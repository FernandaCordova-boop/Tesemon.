import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home';
import { LoginComponent } from './pages/login/login';
import { RegisterComponent } from './pages/register/register';
import { Pve } from './pages/pve/pve';
import { Pvp } from './pages/pvp/pvp';
import { History } from './pages/history/history';
import { Collection } from './pages/collection/collection';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'pve', component: Pve },
  { path: 'pvp', component: Pvp },
  { path: 'history', component: History },
  { path: 'collection', component: Collection }
];


