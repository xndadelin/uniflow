import { ProfesorCourseManageClient } from "@/components/profesor/ProfesorCourseManageClient";

export default async function ProfesorCursManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const courseId = Number(id);
  return <ProfesorCourseManageClient courseId={courseId} />;
}

