import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Clock, AlertTriangle, CheckCircle2, UserPlus, ListOrdered, Hourglass, Download, FileText, User, Shield, LayoutDashboard } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChangePinModal } from "@/components/ChangePinModal";
import { RegistrationForm } from "@/components/RegistrationForm";
import { ReferenceLookupDialog } from "@/components/ReferenceLookupDialog";
import {
  PrefilledRegistrationForm,
  type PrefilledStudent,
} from "@/components/PrefilledRegistrationForm";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { OfferLetter } from "@/components/OfferLetter";
import { downloadOfferLetterPdf } from "@/lib/offerLetterPdf";
import { normalizeOfferLetterProfile } from "@/lib/offerLetterProfile";
import { useRef } from "react";
import { CYBER_CAFE_LOGIN_PATH } from "@/lib/authRoutes";
import {
  fetchCybercafeDashboardData,
  fetchCybercafeStudentByEmail,
} from "@/lib/cybercafeDashboardData";
import { SharedProfilePanel } from "@/components/SharedProfilePanel";
import { StaffSecurityPanel } from "@/components/staff/StaffAccountPanels";

const CyberCafeDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showRegModal, setShowRegModal] = useState(false);
  const [showReferenceLookup, setShowReferenceLookup] = useState(false);
  const [prefilledData, setPrefilledData] = useState<PrefilledStudent | null>(null);
  const [showPrefilledModal, setShowPrefilledModal] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [applications, setApplications] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [downloadEmail, setDownloadEmail] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [pendingInitialData, setPendingInitialData] = useState<any>(null);
  const [prefilledFormKey, setPrefilledFormKey] = useState(0);
  const [regFormKey, setRegFormKey] = useState(0);
  const [activeTab, setActiveTab] = useState<"dashboard" | "profile" | "security">("dashboard");
  const offerLetterRef = useRef<HTMLDivElement>(null);
  // REVIEW (Sandhya): Shared ref is OK — only one registration Dialog is open at a time.
  // True while Razorpay payment modal is open — prevents the registration
  // Dialog from being dismissed by the phantom click that fires when Razorpay closes.
  const isPaymentOpenRef = useRef(false);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate(CYBER_CAFE_LOGIN_PATH);
        return;
      }
      setCurrentUserId(session.user.id);

      // Fetch Profile
      const { data: profileData } = await supabase
        .from("cybercafe_profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (!profileData) {
        toast.error("Unauthorized access. You are not a registered Cyber Cafe partner.");
        navigate("/");
        return;
      }

      if (profileData) {
        setProfile(profileData);

        if (profileData.status === "approved") {
          fetchDashboardData(profileData);
        }
      }

    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const [leads, setLeads] = useState<any[]>([]);

  const fetchDashboardData = async (prof?: { email?: string } | null) => {
    const partnerEmail = prof?.email || profile?.email;
    if (!partnerEmail) {
      console.warn("[cybercafe] dashboard load: partner email missing");
      return;
    }
    try {
      const { applications, leads, transactions } = await fetchCybercafeDashboardData(
        supabase,
        partnerEmail
      );
      setApplications(applications);
      setLeads(leads);
      setTransactions(transactions);
    } catch (err) {
      console.error("[cybercafe] dashboard load:", err);
      toast.error("Could not load registered students. Please refresh the page.");
    }
  };

  const handleDownloadOffer = async (student: any) => {
    setSelectedUser(normalizeOfferLetterProfile(student));
    setSubmitting(true);
    
    // Give time for the hidden component to render with the new data
    setTimeout(async () => {
      if (!offerLetterRef.current) {
        toast.error("Generation failed - element not found");
        setSubmitting(false);
        return;
      }

      try {
        await downloadOfferLetterPdf(offerLetterRef.current, {
          fileName: `EzyIntern_Offer_Letter_${student.full_name?.replace(/\s+/g, "_") || "Student"}.pdf`,
          captureInPlace: false,
        });
        toast.success("Offer letter downloaded successfully!");
      } catch (error) {
        console.error("PDF Error:", error);
        toast.error("Failed to generate PDF");
      } finally {
        setSubmitting(false);
      }
    }, 800);
  };

  const handleManualDownload = async () => {
    if (!downloadEmail) return toast.error("Please enter a student email");
    setSubmitting(true);
    try {
      const data = await fetchCybercafeStudentByEmail(supabase, downloadEmail);
      if (!data) {
        toast.error("No student found with this email (registered through your cafe)");
        setSubmitting(false);
        return;
      }

      await handleDownloadOffer(data);
    } catch (e: any) {
      toast.error(e.message);
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate(CYBER_CAFE_LOGIN_PATH);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold">Cyber Cafe Portal</h1>
            <div className="flex items-center gap-3">
              {currentUserId && <ChangePinModal userId={currentUserId} />}
              <Button variant="outline" onClick={handleLogout}>Logout</Button>
            </div>
          </div>

          {!profile ? (
            <Card><CardContent className="p-8 text-center text-red-500">Profile not found.</CardContent></Card>
          ) : profile.status === "rejected" ? (
            <Card className="max-w-2xl mx-auto shadow-md">
              <CardHeader className="bg-red-50/80 border-b border-red-100">
                <CardTitle className="flex items-center gap-2 text-red-800">
                  <AlertTriangle className="text-red-600" /> Application not approved
                </CardTitle>
                {profile.rejection_reason && (
                  <div className="mt-4 p-4 bg-white text-red-800 border border-red-200 rounded-md text-sm">
                    <strong>Reason:</strong> {profile.rejection_reason}
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-6 text-sm text-muted-foreground">
                If you believe this is a mistake, contact support with your registered email and shop name.
              </CardContent>
            </Card>
          ) : profile.status === "pending_approval" || profile.status === "pending_kyc" ? (
            <Card className="max-w-md mx-auto text-center py-12 shadow-md">
              <Clock className="size-16 text-amber-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">Application under review</h2>
              <p className="text-muted-foreground px-6">
                We have received your partner details. Approval usually takes 12–24 hours. You will be able to register students from this portal once approved.
              </p>
            </Card>
          ) : profile.status === 'approved' ? (
            // MAIN DASHBOARD
            <div className="space-y-6">
              {/* TABS */}
              <div className="flex gap-2 border-b border-slate-200 pb-px mb-6">
                <button
                  onClick={() => setActiveTab("dashboard")}
                  className={`px-4 py-2 font-bold text-sm border-b-2 transition-colors ${
                    activeTab === "dashboard" ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <LayoutDashboard className="size-4 inline mr-2" /> Dashboard
                </button>
                <button
                  onClick={() => setActiveTab("profile")}
                  className={`px-4 py-2 font-bold text-sm border-b-2 transition-colors ${
                    activeTab === "profile" ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <User className="size-4 inline mr-2" /> Profile
                </button>
                <button
                  onClick={() => setActiveTab("security")}
                  className={`px-4 py-2 font-bold text-sm border-b-2 transition-colors ${
                    activeTab === "security" ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Shield className="size-4 inline mr-2" /> Security
                </button>
              </div>

              {activeTab === "profile" && (
                <SharedProfilePanel
                  profileId={profile.id}
                  profileName={profile.shop_name}
                  profileEmail={profile.email}
                  profileImageUrl={profile.profile_image_url}
                  roleLabel="Cyber Cafe Partner"
                  fields={[
                    { label: "Shop Name", value: profile.shop_name },
                    { label: "Owner Name", value: profile.owner_name },
                    { label: "Email", value: profile.email },
                    { label: "Phone", value: profile.phone },
                    { label: "Location", value: profile.location },
                  ]}
                  isActive={activeTab === "profile"}
                  onDatabaseUpdate={async (url) => {
                    await supabase.from("cybercafe_profiles").update({ profile_image_url: url }).eq("id", profile.id);
                  }}
                  onProfileImageUpdated={(url) => setProfile({ ...profile, profile_image_url: url })}
                />
              )}

              {activeTab === "security" && (
                <StaffSecurityPanel
                  isActive={activeTab === "security"}
                  onSignOutCurrent={handleLogout}
                />
              )}

              {activeTab === "dashboard" && (
                <>
                  <div className="grid md:grid-cols-3 gap-6">
                <Card className="bg-primary text-primary-foreground shadow-lg">
                  <CardContent className="p-6 flex flex-col items-center text-center justify-center h-full space-y-4">
                    <UserPlus className="size-10 opacity-80" />
                    <h3 className="font-semibold text-lg">New Application</h3>
                    <p className="text-xs opacity-80 -mt-1">Choose how you want to register the student</p>
                    <div className="w-full space-y-2">
                      <Button
                        variant="secondary"
                        className="w-full font-bold"
                        onClick={() => {
                          sessionStorage.setItem('cybercafe_profile', JSON.stringify({
                            shop_name: profile.shop_name,
                            email: profile.email,
                          }));
                          setPendingInitialData(null);
                          setShowRegModal(true);
                        }}
                      >
                        Manual Registration
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full font-bold bg-white/10 hover:bg-white/20 text-white border-white/40"
                        onClick={() => {
                          sessionStorage.setItem('cybercafe_profile', JSON.stringify({
                            shop_name: profile.shop_name,
                            email: profile.email,
                          }));
                          setShowReferenceLookup(true);
                        }}
                      >
                        Register via Reference No.
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm border-t-4 border-t-indigo-600">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><FileText className="size-5" /></div>
                      <h3 className="font-bold">Download Offer Letter</h3>
                    </div>
                    <div className="space-y-3">
                      <Input 
                        placeholder="Student Email Address" 
                        value={downloadEmail}
                        onChange={e => setDownloadEmail(e.target.value)}
                        className="text-xs h-10"
                      />
                      <Button 
                        className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 font-bold gap-2 text-xs"
                        onClick={handleManualDownload}
                        disabled={submitting}
                      >
                        {submitting ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
                        Download Letter
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="p-3 bg-blue-100 text-blue-600 rounded-lg"><ListOrdered className="size-6" /></div>
                      <div>
                        <p className="text-sm text-muted-foreground font-medium">Registered Students</p>
                        <h3 className="text-3xl font-bold">{applications.length}</h3>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="p-3 bg-orange-100 text-orange-600 rounded-lg"><Hourglass className="size-6" /></div>
                      <div>
                        <p className="text-sm text-muted-foreground font-medium">Pending Leads</p>
                        <h3 className="text-3xl font-bold">{leads.length}</h3>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Lists */}
              <div className="space-y-6">
                <Card className="shadow-sm">
                  <CardHeader className="border-b bg-slate-50/50 flex flex-row items-center justify-between">
                    <CardTitle className="text-lg">Registered Students Directory</CardTitle>
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-100">{applications.length} Students</Badge>
                  </CardHeader>
                  <CardContent className="p-0 max-h-[400px] overflow-auto">
                    {applications.length === 0 ? (
                      <p className="p-12 text-center text-muted-foreground">No completed registrations yet.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Student Name</TableHead>
                            <TableHead>Reg. ID</TableHead>
                            <TableHead>University / College</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {applications.map(app => (
                            <TableRow key={app.id}>
                              <TableCell className="font-medium">{app.full_name}</TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="font-mono text-[10px]">{app.registration_id || 'Pending'}</Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {app.college_name || app.university_name}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-xs">{new Date(app.created_at).toLocaleDateString()}</TableCell>
                              <TableCell className="text-right">
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleDownloadOffer(app)}>
                                  <Download className="size-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>

                <div className="grid md:grid-cols-2 gap-6">
                  <Card className="shadow-sm border-orange-100">
                    <CardHeader className="border-b bg-orange-50/30 flex flex-row items-center justify-between">
                      <CardTitle className="text-lg text-orange-800">Pending Leads</CardTitle>
                      <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-200">{leads.length} Leads</Badge>
                    </CardHeader>
                    <CardContent className="p-0 max-h-[400px] overflow-auto">
                      {leads.length === 0 ? (
                        <p className="p-12 text-center text-muted-foreground">No pending leads.</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Name/Email</TableHead>
                              <TableHead>Phone</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {leads.map((l, i) => (
                              <TableRow key={i}>
                                <TableCell>
                                  <div className="font-medium text-xs">{(l.metadata as any)?.fullName || l.user_email || 'No Name'}</div>
                                  <div className="text-[10px] text-muted-foreground">{l.user_email || l.email}</div>
                                </TableCell>
                                <TableCell className="text-xs">{l.user_phone || l.phone || '-'}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-[9px] uppercase tracking-tighter">
                                    {l.status_label}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-[10px] text-muted-foreground">{new Date(l.created_at).toLocaleDateString()}</TableCell>
                                <TableCell className="text-right">
                                  <Button 
                                    size="sm" 
                                    variant="outline" 
                                    className="h-7 text-[9px] px-2 font-bold bg-orange-50 hover:bg-orange-100 border-orange-200 text-orange-700"
                                    onClick={() => {
                                      setPendingInitialData(l.metadata);
                                      setShowRegModal(true);
                                    }}
                                  >
                                    Continue
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="shadow-sm">
                    <CardHeader className="border-b bg-slate-50/50 flex flex-row items-center justify-between">
                      <CardTitle className="text-lg">Recent Transactions</CardTitle>
                      <Hourglass className="size-4 text-green-600" />
                    </CardHeader>
                    <CardContent className="p-0 max-h-[400px] overflow-auto">
                      {transactions.length === 0 ? (
                        <p className="p-12 text-center text-muted-foreground">No transactions yet.</p>
                      ) : (
                        <Table>
                          <TableHeader>
                          <TableRow>
                            <TableHead>Student</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Date</TableHead>
                          </TableRow>
                          </TableHeader>
                          <TableBody>
                            {transactions.map(tx => (
                              <TableRow key={tx.id}>
                                <TableCell>
                                  <div className="font-medium text-xs">{tx.full_name}</div>
                                  <div className="text-[9px] text-muted-foreground font-mono">{tx.payment_id}</div>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">Paid</TableCell>
                                <TableCell className="text-[10px] text-muted-foreground">{new Date(tx.created_at).toLocaleDateString()}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
                </>
              )}

              <div className="fixed left-[-10000px] top-0 pointer-events-none" aria-hidden>
                {selectedUser && <OfferLetter ref={offerLetterRef} profile={selectedUser} />}
              </div>
            </div>
          ) : (
            <Card><CardContent className="p-8 text-center text-red-500">Account Blocked.</CardContent></Card>
          )}

        </div>
      </main>

      <Dialog
        open={showRegModal}
        onOpenChange={(open) => {
          // REVIEW (Sandhya): Block accidental Dialog close during Razorpay checkout.
          if (!open && isPaymentOpenRef.current) return;
          setShowRegModal(open);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Student Registration</DialogTitle>
            <DialogDescription>
              Register a student on behalf of your cyber café. Draft progress is saved automatically.
            </DialogDescription>
          </DialogHeader>
          <RegistrationForm
            key={regFormKey}
            variant="cybercafe"
            initialData={pendingInitialData}
            onPaymentOpenChange={(open) => { isPaymentOpenRef.current = open; }}
            onSuccess={() => {
              fetchDashboardData(profile);
            }}
            onRegisterAnother={() => {
              fetchDashboardData(profile);
              setRegFormKey((k) => k + 1);
            }}
          />
        </DialogContent>
      </Dialog>

      <ReferenceLookupDialog
        open={showReferenceLookup}
        onOpenChange={setShowReferenceLookup}
        onMatched={(data) => {
          setPrefilledData(data);
          setShowPrefilledModal(true);
        }}
      />

      <Dialog
        open={showPrefilledModal}
        onOpenChange={(open) => {
          // REVIEW (Sandhya): Block accidental Dialog close during Razorpay checkout.
          if (!open && isPaymentOpenRef.current) return;
          setShowPrefilledModal(open);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Prefilled Student Registration</DialogTitle>
            <DialogDescription>
              Complete registration using roster reference data for this student.
            </DialogDescription>
          </DialogHeader>
          {prefilledData && profile && (
            <PrefilledRegistrationForm
              key={prefilledFormKey}
              data={prefilledData}
              cybercafeProfile={{ shop_name: profile.shop_name, email: profile.email }}
              onPaymentOpenChange={(open) => { isPaymentOpenRef.current = open; }}
              onSuccess={() => {
                fetchDashboardData(profile);
              }}
              onRegisterAnother={() => {
                setPrefilledData(null);
                setShowPrefilledModal(false);
                setShowReferenceLookup(true);
                fetchDashboardData(profile);
                setPrefilledFormKey((k) => k + 1);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CyberCafeDashboard;
