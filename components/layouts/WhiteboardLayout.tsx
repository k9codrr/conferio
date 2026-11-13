import React from "react";
import { Header } from "@/components/doc-components/Header";
import Mainsidebar from "../ui/thinSidebar";

export default function PageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full !h-screen !max-h-screen flex">
      <div className="relative z-40">
        <Mainsidebar />
      </div>
      <div className=" flex flex-col relative w-full">
      <div className="relative z-40 w-full">
        <Header />
      </div>
      <div className="fixed inset-0">
      {children}
      </div>
      </div>
    </div>
  );
}