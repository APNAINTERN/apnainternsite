import { useState, useRef, useEffect, useCallback } from "react";
import {
  IdCard,
  CreditCard,
  Search,
  UploadCloud,
  Download,
  Printer,
  History,
  Users,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IdCard as IdCardTemplate, type IdCardData } from "@/components/IdCard";
import {
  IdCardCategory,
  IdCardRecord,
  fetchIdCardHistory,
  fetchUsersByCategory,
  generateIdCardNumber,
  resolveIdCardPosition,
  saveIdCardRecord,
  deleteIdCardRecord,
} from "@/lib/idCardApi";
import jsPDF from "jspdf";
import { Checkbox } from "@/components/ui/checkbox";
import {
  BULK_ID_CARD_MAX,
  downloadIdCardsCombinedPdf,
  downloadIdCardsZip,
  idCardPdfFilename,
  captureIdCardPng,
} from "@/lib/idCardPdf";

export function IdCardManagementPanel() {
  const [activeTab, setActiveTab] = useState("manual");
  const [currentAdminEmail, setCurrentAdminEmail] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setCurrentAdminEmail(data.session?.user.email || "Admin");
    });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-2">
            <IdCard className="size-6 text-primary" /> ID Card Generation
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Create, manage, and print ID cards for all users.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 max-w-2xl bg-white/50 p-1 rounded-xl border mb-6">
          <TabsTrigger value="manual" className="rounded-lg text-xs font-bold data-[state=active]:bg-primary data-[state=active]:text-white">
            <CreditCard className="size-3.5 mr-1.5" /> Manual
          </TabsTrigger>
          <TabsTrigger value="category" className="rounded-lg text-xs font-bold data-[state=active]:bg-primary data-[state=active]:text-white">
            <Users className="size-3.5 mr-1.5" /> By Category
          </TabsTrigger>
          <TabsTrigger value="bulk" className="rounded-lg text-xs font-bold data-[state=active]:bg-primary data-[state=active]:text-white">
            <UploadCloud className="size-3.5 mr-1.5" /> Bulk Upload
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-lg text-xs font-bold data-[state=active]:bg-primary data-[state=active]:text-white">
            <History className="size-3.5 mr-1.5" /> History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="mt-0 outline-none">
          <ManualGenerationTab adminEmail={currentAdminEmail} />
        </TabsContent>

        <TabsContent value="category" className="mt-0 outline-none">
          <CategoryGenerationTab adminEmail={currentAdminEmail} />
        </TabsContent>

        <TabsContent value="bulk" className="mt-0 outline-none">
          <BulkGenerationTab />
        </TabsContent>

        <TabsContent value="history" className="mt-0 outline-none">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ----------------------------------------------------------------------
// MANUAL GENERATION TAB
// ----------------------------------------------------------------------
function ManualGenerationTab({ adminEmail }: { adminEmail: string }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<IdCardCategory>("student");
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Preview
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<IdCardData | null>(null);
  const [generating, setGenerating] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      toast.error("Please enter a search term");
      return;
    }
    setLoading(true);
    const results = await fetchUsersByCategory(supabase, selectedCategory, { searchTerm });
    setUsers(results);
    setLoading(false);
    if (results.length === 0) toast.error("No users found");
  };

  const preparePreview = async (user: any) => {
    setGenerating(true);
    try {
      const cardNumber = await generateIdCardNumber(supabase, selectedCategory);
      const position = resolveIdCardPosition(selectedCategory, {
        position: user.position,
        role_tag: user.role_tag,
        course: user.course || user.internship_domain,
        internship_domain: user.internship_domain,
      });

      let rawJoiningDate = user.joining_date || user.created_at || "";
      let formattedJoiningDate = "";
      if (rawJoiningDate) {
        try {
          const d = new Date(rawJoiningDate);
          if (!isNaN(d.getTime())) {
            const day = String(d.getDate()).padStart(2, "0");
            const month = String(d.getMonth() + 1).padStart(2, "0");
            const year = d.getFullYear();
            formattedJoiningDate = `${day}-${month}-${year}`;
          }
        } catch (e) {
          formattedJoiningDate = String(rawJoiningDate);
        }
      }

      setPreviewData({
        id: user.id,
        cardNumber,
        userName: user.name || user.full_name || "User",
        userEmail: user.email || "",
        userPhone: user.phone || user.contact_number || user.mobile_number || "",
        position,
        category: selectedCategory,
        collegeName: user.college_name || user.shop_name || "",
        course: user.course || user.internship_domain || "",
        profileImageUrl: user.profile_image_url || "",
        registrationId: user.registration_id || user.employee_code || "",
        joiningDate: formattedJoiningDate,
      });
      setIsPreviewOpen(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to prepare ID card");
    } finally {
      setGenerating(false);
    }
  };

  const generatePDF = async (shouldPrint = false) => {
    if (!cardRef.current || !previewData) return;
    
    setGenerating(true);
    try {
      // Save record to DB
      await saveIdCardRecord(supabase, {
        card_number: previewData.cardNumber,
        user_id: previewData.id,
        user_name: previewData.userName,
        user_email: previewData.userEmail,
        category: previewData.category,
        generated_by: adminEmail,
        status: "generated",
        metadata: {
          source: "manual",
          phone: previewData.userPhone || "",
          position: previewData.position || "",
          registration_id: previewData.registrationId || "",
          course: previewData.course || "",
          college: previewData.collegeName || "",
          joining_date: previewData.joiningDate || "",
        },
      });

      const imgData = await captureIdCardPng(previewData);
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "px",
        format: [350, 560],
        compress: true,
      });
      pdf.addImage(imgData, "PNG", 0, 0, 350, 560);
      
      if (shouldPrint) {
        pdf.autoPrint();
        window.open(pdf.output("bloburl"), "_blank");
      } else {
        pdf.save(`${previewData.cardNumber}_${previewData.userName}.pdf`);
        toast.success("ID Card Downloaded!");
      }
    } catch (err: any) {
      toast.error("Failed to generate PDF: " + err.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card className="border-none shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Manual Generation</CardTitle>
        <CardDescription>Search for a specific user to generate an ID card.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="w-full md:w-1/4">
            <Select value={selectedCategory} onValueChange={(val: any) => setSelectedCategory(val)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="student">Student</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="cybercafe">Cyber Cafe</SelectItem>
                <SelectItem value="referral">Referral Partner</SelectItem>
                <SelectItem value="college_admin">College Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 flex gap-2">
            <Input
              placeholder="Search by name, email or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            </Button>
          </div>
        </div>

        {users.length > 0 && (
          <div className="border rounded-xl overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{u.phone || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" onClick={() => preparePreview(u)} disabled={generating}>
                        Generate
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
          <DialogContent className="sm:max-w-[900px] w-[95vw]">
            <DialogHeader>
              <DialogTitle>Preview & Customize ID Card</DialogTitle>
            </DialogHeader>
            
            {previewData && (
              <div className="grid md:grid-cols-2 gap-6 mt-4 items-start">
                {/* Form to enter/fix missing details */}
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                  <h3 className="font-bold text-sm text-slate-500 uppercase tracking-wider">Verify Details</h3>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-name">Full Name</Label>
                    <Input
                      id="edit-name"
                      value={previewData.userName}
                      onChange={(e) => setPreviewData({ ...previewData, userName: e.target.value })}
                      placeholder="Enter full name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-position">Position / Domain</Label>
                    <Input
                      id="edit-position"
                      value={previewData.position || ""}
                      onChange={(e) => setPreviewData({ ...previewData, position: e.target.value })}
                      placeholder="Enter position or domain"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-card-number">ID Card Number</Label>
                    <Input
                      id="edit-card-number"
                      value={previewData.cardNumber}
                      onChange={(e) => setPreviewData({ ...previewData, cardNumber: e.target.value })}
                      placeholder="Enter card number"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-joining-date">Date of Joining</Label>
                    <Input
                      id="edit-joining-date"
                      placeholder="e.g. 25-07-2026"
                      value={previewData.joiningDate || ""}
                      onChange={(e) => setPreviewData({ ...previewData, joiningDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-email">Email Address</Label>
                    <Input
                      id="edit-email"
                      type="email"
                      value={previewData.userEmail}
                      onChange={(e) => setPreviewData({ ...previewData, userEmail: e.target.value })}
                      placeholder="Enter email"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-phone">Phone Number</Label>
                    <Input
                      id="edit-phone"
                      value={previewData.userPhone || ""}
                      onChange={(e) => setPreviewData({ ...previewData, userPhone: e.target.value })}
                      placeholder="Enter phone number"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-college">College / Org Name</Label>
                    <Input
                      id="edit-college"
                      value={previewData.collegeName || ""}
                      onChange={(e) => setPreviewData({ ...previewData, collegeName: e.target.value })}
                      placeholder="Enter college or organization"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-avatar">Profile Image (URL or Local Upload)</Label>
                    <div className="flex gap-2">
                      <Input
                        id="edit-avatar"
                        placeholder="Enter image URL"
                        value={previewData.profileImageUrl || ""}
                        onChange={(e) => setPreviewData({ ...previewData, profileImageUrl: e.target.value })}
                        className="flex-grow"
                      />
                      <div className="relative">
                        <input
                          type="file"
                          accept="image/*"
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (event) => {
                                if (event.target?.result) {
                                  setPreviewData({
                                    ...previewData,
                                    profileImageUrl: event.target.result as string
                                  });
                                  toast.success("Temporary print photo loaded!");
                                }
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                        <Button type="button" variant="outline">Upload</Button>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Used for this print session only. Will not save to database.</p>
                  </div>
                </div>

                {/* Live rendering preview */}
                <div className="flex flex-col items-center justify-center py-6 bg-slate-50 rounded-xl border min-h-[450px]">
                  <div className="transform scale-[0.55] sm:scale-[0.6] md:scale-[0.65] origin-center">
                    <IdCardTemplate ref={cardRef} data={previewData} />
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6 border-t pt-4">
              <Button variant="outline" onClick={() => setIsPreviewOpen(false)}>Cancel</Button>
              <Button variant="secondary" onClick={() => generatePDF(true)} disabled={generating} className="gap-2">
                <Printer className="size-4" /> Print
              </Button>
              <Button onClick={() => generatePDF(false)} disabled={generating} className="gap-2">
                {generating ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                Download PDF
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------
// CATEGORY GENERATION TAB
// ----------------------------------------------------------------------
function CategoryGenerationTab({ adminEmail }: { adminEmail: string }) {
  const [selectedCategory, setSelectedCategory] = useState<IdCardCategory>("student");
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkWorking, setBulkWorking] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const results = await fetchUsersByCategory(supabase, selectedCategory);
    setUsers(results);
    setSelectedIds([]);
    setLoading(false);
  }, [selectedCategory]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const toggleSelectAll = () => {
    if (selectedIds.length === users.length && users.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(users.map((u) => u.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const buildCardPayloads = async (selectedUsers: any[]) => {
    const payloads: Array<{ data: IdCardData; filename: string }> = [];
    for (const user of selectedUsers) {
      const cardNumber = await generateIdCardNumber(supabase, selectedCategory);
      const position = resolveIdCardPosition(selectedCategory, {
        position: user.position,
        role_tag: user.role_tag,
        course: user.course || user.internship_domain,
        internship_domain: user.internship_domain,
      });

      let rawJoiningDate = user.joining_date || user.created_at || "";
      let formattedJoiningDate = "";
      if (rawJoiningDate) {
        try {
          const d = new Date(rawJoiningDate);
          if (!isNaN(d.getTime())) {
            const day = String(d.getDate()).padStart(2, "0");
            const month = String(d.getMonth() + 1).padStart(2, "0");
            const year = d.getFullYear();
            formattedJoiningDate = `${day}-${month}-${year}`;
          }
        } catch (e) {
          formattedJoiningDate = String(rawJoiningDate);
        }
      }

      const data: IdCardData = {
        id: user.id,
        cardNumber,
        userName: user.name || user.full_name || "User",
        userEmail: user.email || "",
        userPhone: user.phone || user.contact_number || user.mobile_number || "",
        position,
        category: selectedCategory,
        collegeName: user.college_name || user.shop_name,
        course: user.course || user.internship_domain,
        profileImageUrl: user.profile_image_url,
        registrationId: user.registration_id || user.employee_code,
        joiningDate: formattedJoiningDate,
      };
      await saveIdCardRecord(supabase, {
        card_number: cardNumber,
        user_id: user.id,
        user_name: data.userName,
        user_email: data.userEmail,
        category: selectedCategory,
        generated_by: adminEmail || "Admin",
        status: "generated",
        metadata: {
          source: "bulk_category",
          phone: data.userPhone || "",
          position: data.position || "",
          registration_id: data.registrationId || "",
          course: data.course || "",
          college: data.collegeName || "",
          joining_date: data.joiningDate || "",
        },
      });
      payloads.push({
        data,
        filename: idCardPdfFilename(cardNumber, data.userName),
      });
    }
    return payloads;
  };

  const handleBulkGenerate = async () => {
    if (selectedIds.length === 0) {
      toast.error("Select at least one user");
      return;
    }
    if (selectedIds.length > BULK_ID_CARD_MAX) {
      toast.error(`Select at most ${BULK_ID_CARD_MAX} users at a time`);
      return;
    }

    const selectedUsers = users.filter((u) => selectedIds.includes(u.id));
    if (selectedUsers.length === 0) {
      toast.error("Selected users not found — refresh and try again");
      return;
    }

    setBulkWorking(true);
    const toastId = toast.loading(`Preparing ${selectedUsers.length} ID cards…`);
    try {
      toast.loading(`Assigning card numbers (0/${selectedUsers.length})…`, { id: toastId });
      const payloads = await buildCardPayloads(selectedUsers);

      await downloadIdCardsZip(payloads, {
        concurrency: 1,
        onProgress: ({ done, total, phase }) => {
          if (phase === "zipping") {
            toast.loading("Creating ZIP…", { id: toastId });
          } else {
            toast.loading(`Rendering cards ${done}/${total}…`, { id: toastId });
          }
        },
      });

      toast.success(`Downloaded ZIP with ${payloads.length} ID cards`, { id: toastId });
      setSelectedIds([]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Bulk ID card generation failed", {
        id: toastId,
      });
    } finally {
      setBulkWorking(false);
    }
  };

  const handleBulkPrint = async () => {
    if (selectedIds.length === 0) {
      toast.error("Select at least one user");
      return;
    }
    if (selectedIds.length > BULK_ID_CARD_MAX) {
      toast.error(`Select at most ${BULK_ID_CARD_MAX} users at a time`);
      return;
    }

    const selectedUsers = users.filter((u) => selectedIds.includes(u.id));
    if (selectedUsers.length === 0) {
      toast.error("Selected users not found — refresh and try again");
      return;
    }

    setBulkWorking(true);
    const toastId = toast.loading(`Preparing ${selectedUsers.length} ID cards for print…`);
    try {
      const payloads = await buildCardPayloads(selectedUsers);
      await downloadIdCardsCombinedPdf(
        payloads.map((p) => p.data),
        {
          onProgress: ({ done, total }) => {
            toast.loading(`Rendering cards ${done}/${total}…`, { id: toastId });
          },
        }
      );
      toast.success(`Downloaded print PDF with ${payloads.length} ID cards`, { id: toastId });
      setSelectedIds([]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Bulk print failed", { id: toastId });
    } finally {
      setBulkWorking(false);
    }
  };

  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-lg">By Category</CardTitle>
          <CardDescription>Select a category and generate multiple cards.</CardDescription>
        </div>
        <Select value={selectedCategory} onValueChange={(val: any) => setSelectedCategory(val)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="student">Student</SelectItem>
            <SelectItem value="staff">Staff</SelectItem>
            <SelectItem value="cybercafe">Cyber Cafe</SelectItem>
            <SelectItem value="referral">Referral Partner</SelectItem>
            <SelectItem value="college_admin">College Admin</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-12 text-center text-muted-foreground"><Loader2 className="size-6 animate-spin mx-auto mb-2" /> Loading users...</div>
        ) : users.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">No users found in this category.</div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border">
              <div className="flex items-center gap-2">
                <Checkbox 
                  checked={selectedIds.length === users.length && users.length > 0} 
                  onCheckedChange={toggleSelectAll}
                  disabled={bulkWorking}
                />
                <span className="text-sm font-bold">{selectedIds.length} selected</span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selectedIds.length === 0 || bulkWorking}
                  onClick={() => void handleBulkPrint()}
                >
                  {bulkWorking ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Printer className="size-4 mr-2" />}
                  Print Selected
                </Button>
                <Button
                  size="sm"
                  disabled={selectedIds.length === 0 || bulkWorking}
                  onClick={() => void handleBulkGenerate()}
                >
                  {bulkWorking ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Download className="size-4 mr-2" />}
                  Generate ZIP
                </Button>
              </div>
            </div>
            
            <div className="border rounded-xl overflow-auto max-h-[500px]">
              <Table>
                <TableHeader className="bg-white sticky top-0 shadow-sm z-10">
                  <TableRow>
                    <TableHead className="w-12 text-center">
                      <Checkbox 
                        checked={selectedIds.length === users.length && users.length > 0} 
                        onCheckedChange={toggleSelectAll}
                        disabled={bulkWorking}
                      />
                    </TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map(u => (
                    <TableRow key={u.id} className={selectedIds.includes(u.id) ? "bg-primary/5" : ""}>
                      <TableCell className="text-center">
                        <Checkbox 
                          checked={selectedIds.includes(u.id)} 
                          onCheckedChange={() => toggleSelect(u.id)}
                          disabled={bulkWorking}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">Available</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------
// BULK UPLOAD TAB
// ----------------------------------------------------------------------
function BulkGenerationTab() {
  return (
    <Card className="border-none shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Bulk Upload</CardTitle>
        <CardDescription>Upload a CSV file to generate ID cards in bulk.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center hover:bg-slate-50 transition-colors cursor-pointer">
          <div className="size-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <UploadCloud className="size-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-2">Click or drag CSV to upload</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
            File must contain columns: Email, Full Name, Category, Phone (optional).
          </p>
          <Button>Select CSV File</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------
// HISTORY TAB
// ----------------------------------------------------------------------
function HistoryTab() {
  const [history, setHistory] = useState<IdCardRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  
  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const { rows } = await fetchIdCardHistory(supabase, {
        searchTerm,
        category: categoryFilter,
      });
      setHistory(rows);
    } catch (err) {
      // Ignored for UI
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, categoryFilter]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this record?")) return;
    try {
      await deleteIdCardRecord(supabase, id);
      toast.success("Record deleted");
      loadHistory();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    }
  };

  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="flex flex-col md:flex-row md:items-center justify-between pb-4 gap-4">
        <div>
          <CardTitle className="text-lg">Generation History</CardTitle>
          <CardDescription>Log of all ID cards generated.</CardDescription>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="student">Student</SelectItem>
              <SelectItem value="staff">Staff</SelectItem>
              <SelectItem value="cybercafe">Cyber Cafe</SelectItem>
              <SelectItem value="referral">Referral Partner</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <Input 
              placeholder="Search history..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadHistory()}
              className="pl-9 h-9"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-xl overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead>Card Number</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Generated By</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    <Loader2 className="size-5 animate-spin mx-auto mb-2" />
                  </TableCell>
                </TableRow>
              ) : history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    No history records found.
                  </TableCell>
                </TableRow>
              ) : (
                history.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-bold text-primary">{record.card_number}</TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">{record.user_name}</div>
                      <div className="text-xs text-slate-500">{record.user_email}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize text-[10px]">
                        {record.category.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{record.generated_by}</TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {new Date(record.generated_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="size-7" title="Download">
                          <Download className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-7 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(record.id)} title="Delete">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
