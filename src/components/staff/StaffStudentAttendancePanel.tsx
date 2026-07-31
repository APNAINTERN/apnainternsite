import { useState, useEffect, useMemo, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Search, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  MinusCircle, 
  Calendar,
  Save,
  Trash2,
  Edit2
} from "lucide-react";
import { localDayStart, localDayEndExclusive } from "@/lib/attendanceStats";

export function StaffStudentAttendancePanel({ currentUserId, isActive }: { currentUserId: string; isActive: boolean }) {
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState<any[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);
  const [collegeFilter, setCollegeFilter] = useState("all");
  
  // Options
  const [colleges, setColleges] = useState<string[]>([]);
  
  // Ops
  const [opLoading, setOpLoading] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!isActive) return;
    setLoading(true);
    try {
      // Load all active students
      const { data: studentsData, error: studentsErr } = await supabase
        .from("students")
        .select("id, full_name, email, registration_id, college_name, internship_domain, course, roll_number, university_name")
        .neq("status", "Archived")
        .order("full_name");
        
      if (studentsErr) throw studentsErr;
      
      const uniqueColleges = Array.from(new Set((studentsData || []).map(s => s.college_name).filter(Boolean))) as string[];
      setColleges(uniqueColleges.sort());
      setStudents(studentsData || []);
      
      await loadAttendanceForDate(dateFilter);
    } catch (err: any) {
      toast.error("Failed to load students: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [isActive]);

  const loadAttendanceForDate = async (dateStr: string) => {
    try {
      // dateStr is YYYY-MM-DD
      const start = new Date(dateStr);
      start.setHours(0, 0, 0, 0);
      const end = new Date(dateStr);
      end.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .gte("marked_at", start.toISOString())
        .lte("marked_at", end.toISOString());

      if (error) throw error;
      setAttendanceRecords(data || []);
    } catch (err: any) {
      console.error("Attendance load err:", err);
      toast.error("Failed to load attendance for " + dateStr);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (isActive) {
      loadAttendanceForDate(dateFilter);
    }
  }, [dateFilter, isActive]);

  const handleMarkAttendance = async (studentId: string, status: string, existingRecord: any) => {
    setOpLoading(studentId);
    try {
      // We'll mark for the selected dateFilter date, at 12:00 PM local time
      const targetDate = new Date(dateFilter);
      targetDate.setHours(12, 0, 0, 0);

      if (status === "delete" && existingRecord) {
        const { error } = await supabase.from("attendance").delete().eq("id", existingRecord.id);
        if (error) throw error;
        toast.success("Attendance record removed");
      } else if (existingRecord) {
        // Update existing
        const { error } = await supabase.from("attendance")
          .update({ 
             is_present: status === "present",
             is_leave: status === "leave"
          })
          .eq("id", existingRecord.id);
        if (error) throw error;
        toast.success("Attendance updated");
      } else {
        // Insert new
        const { error } = await supabase.from("attendance").insert({
          student_id: studentId,
          marked_at: targetDate.toISOString(),
          is_present: status === "present",
          is_leave: status === "leave",
          marked_by: currentUserId
        });
        if (error) throw error;
        toast.success("Attendance marked");
      }
      
      await loadAttendanceForDate(dateFilter);
    } catch (err: any) {
      toast.error("Failed to mark attendance: " + err.message);
    } finally {
      setOpLoading(null);
    }
  };

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      if (collegeFilter !== "all" && s.college_name !== collegeFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return (
          (s.full_name || "").toLowerCase().includes(q) ||
          (s.email || "").toLowerCase().includes(q) ||
          (s.registration_id || "").toLowerCase().includes(q) ||
          (s.roll_number || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [students, searchTerm, collegeFilter]);

  if (!isActive) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-end justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap gap-4 items-end flex-1">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input 
                type="date" 
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-40 pl-9 font-medium"
              />
            </div>
          </div>
          
          <div className="space-y-1 w-56">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">College</label>
            <Select value={collegeFilter} onValueChange={setCollegeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Colleges" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Colleges</SelectItem>
                {colleges.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 flex-1 min-w-[200px]">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Search Student</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input 
                placeholder="Name, Email, Reg ID, Roll No..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </div>
      </div>

      <Card className="border-none shadow-elegant bg-white overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-slate-400">
            <Loader2 className="size-8 animate-spin" />
          </div>
        ) : (
          <ScrollArea className="h-[650px]">
            <Table>
              <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>College & Domain</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-32 text-center text-slate-500">
                      No students found matching your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredStudents.map(student => {
                    const record = attendanceRecords.find(r => r.student_id === student.id);
                    
                    let statusLabel = "Not Marked";
                    let statusColor = "bg-slate-100 text-slate-600";
                    if (record) {
                      if (record.is_leave) {
                        statusLabel = "Leave";
                        statusColor = "bg-orange-100 text-orange-700";
                      } else if (record.is_present) {
                        statusLabel = "Present";
                        statusColor = "bg-emerald-100 text-emerald-700";
                      } else {
                        statusLabel = "Absent";
                        statusColor = "bg-red-100 text-red-700";
                      }
                    }

                    return (
                      <TableRow key={student.id} className="hover:bg-slate-50/50">
                        <TableCell>
                          <div className="font-bold text-slate-900">{student.full_name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{student.email}</div>
                          {student.registration_id && (
                            <div className="text-[10px] text-slate-400 font-mono mt-1">{student.registration_id}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium text-slate-700 max-w-[200px] truncate" title={student.college_name || "N/A"}>
                            {student.college_name || "N/A"}
                          </div>
                          <div className="text-xs text-indigo-600 font-medium mt-1">
                            {student.internship_domain || student.course || "N/A"}
                          </div>
                          {student.roll_number && (
                            <div className="text-[10px] text-slate-500 mt-1">Roll: {student.roll_number}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${statusColor} hover:${statusColor} border-none font-bold`}>
                            {statusLabel}
                          </Badge>
                          {record?.marked_by && record.marked_by !== student.id && (
                            <div className="text-[10px] text-slate-400 mt-1">Marked by Staff</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant={record?.is_present && !record?.is_leave ? "default" : "outline"}
                              className={`h-8 w-8 p-0 rounded-full ${record?.is_present && !record?.is_leave ? 'bg-emerald-600 hover:bg-emerald-700 shadow-md' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                              disabled={opLoading === student.id}
                              onClick={() => handleMarkAttendance(student.id, "present", record)}
                              title="Mark Present"
                            >
                              {opLoading === student.id ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-4" />}
                            </Button>
                            <Button
                              size="sm"
                              variant={record && !record.is_present && !record.is_leave ? "default" : "outline"}
                              className={`h-8 w-8 p-0 rounded-full ${record && !record.is_present && !record.is_leave ? 'bg-red-600 hover:bg-red-700 shadow-md' : 'text-slate-400 hover:text-red-600 hover:bg-red-50'}`}
                              disabled={opLoading === student.id}
                              onClick={() => handleMarkAttendance(student.id, "absent", record)}
                              title="Mark Absent"
                            >
                              <XCircle className="size-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant={record?.is_leave ? "default" : "outline"}
                              className={`h-8 w-8 p-0 rounded-full ${record?.is_leave ? 'bg-orange-500 hover:bg-orange-600 shadow-md' : 'text-slate-400 hover:text-orange-500 hover:bg-orange-50'}`}
                              disabled={opLoading === student.id}
                              onClick={() => handleMarkAttendance(student.id, "leave", record)}
                              title="Mark Leave"
                            >
                              <MinusCircle className="size-4" />
                            </Button>
                            
                            {record && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 ml-2"
                                disabled={opLoading === student.id}
                                onClick={() => handleMarkAttendance(student.id, "delete", record)}
                                title="Clear Attendance"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </Card>
    </div>
  );
}
