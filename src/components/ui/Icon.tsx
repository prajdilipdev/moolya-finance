import React from 'react'
import {
  Utensils, Flame, ShoppingBasket, Coffee, Car, Fuel, CarTaxiFront, TrainFront, Bus, Home, House,
  Wrench, Zap, PlugZap, Droplets, FileText, Smartphone, Wifi, HeartPulse, Pill, GraduationCap,
  ShoppingBag, MonitorSmartphone, Shirt, Film, Plane, Repeat, CreditCard, Sparkles, CircleDashed,
  Wallet, Briefcase, Laptop, Building2, TrendingUp, Percent, BadgePercent, Gift, Coins, PiggyBank,
  Banknote, Landmark, Tag, Search, X, Plus, ArrowUp, ArrowDown, ChevronRight, ChevronLeft,
  Trash2, Pencil, Download, Upload, Settings, LayoutDashboard, List, Receipt, WalletCards,
  CalendarClock, Target, Scale, PieChart, FileBarChart, Command, ArrowUpRight, ArrowDownRight,
  Check, CheckCircle2, AlertTriangle, Info, User, Bell, Moon, Sun, Monitor, Sparkle, Calculator,
  Star, Crown, History, Database, Shield, TrendingDown, TrendingUp as TrendUp, Boxes, Eye,
} from 'lucide-react'

const MAP: Record<string, React.ElementType> = {
  Utensils, Flame, ShoppingBasket, Coffee, Car, Fuel, CarTaxiFront, TrainFront, Bus, Home, House,
  Wrench, Zap, PlugZap, Droplets, FileText, Smartphone, Wifi, HeartPulse, Pill, GraduationCap,
  ShoppingBag, MonitorSmartphone, Shirt, Film, Plane, Repeat, CreditCard, Sparkles, CircleDashed,
  Wallet, Briefcase, Laptop, Building2, TrendingUp, Percent, BadgePercent, Gift, Coins, PiggyBank,
  Banknote, Landmark, Tag, Search, X, Plus, ArrowUp, ArrowDown, ChevronRight, ChevronLeft,
  Trash2, Pencil, Download, Upload, Settings, LayoutDashboard, List, Receipt, WalletCards,
  CalendarClock, Target, Scale, PieChart, FileBarChart, Command, ArrowUpRight, ArrowDownRight,
  Check, CheckCircle2, AlertTriangle, Info, User, Bell, Moon, Sun, Monitor, Sparkle, Calculator,
  Star, Crown, History, Database, Shield, TrendingDown, TrendUp, Boxes, Eye,
}

export function Icon({ name, className, size }: { name: string; className?: string; size?: number }) {
  const C = MAP[name] || Tag
  return <C className={className} size={size} />
}
