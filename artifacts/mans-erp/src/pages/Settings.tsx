import { useLanguage } from "@/lib/language-provider";
import { useGetCurrentUser, useUpdateCurrentUser } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { UserCircle } from "lucide-react";
import { useEffect, useRef } from "react";

const profileSchema = z.object({
  firstNameEn: z.string().optional(),
  lastNameEn: z.string().optional(),
  firstNameAr: z.string().optional(),
  lastNameAr: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function Settings() {
  const { t, lang, dir } = useLanguage();
  const { data: user, isLoading } = useGetCurrentUser();
  const updateUser = useUpdateCurrentUser();
  const { toast } = useToast();
  
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstNameEn: "",
      lastNameEn: "",
      firstNameAr: "",
      lastNameAr: "",
    },
  });

  const initializedRef = useRef(false);

  useEffect(() => {
    if (user && !initializedRef.current) {
      form.reset({
        firstNameEn: user.firstNameEn || "",
        lastNameEn: user.lastNameEn || "",
        firstNameAr: user.firstNameAr || "",
        lastNameAr: user.lastNameAr || "",
      });
      initializedRef.current = true;
    }
  }, [user, form]);

  const onSubmit = (data: ProfileFormValues) => {
    updateUser.mutate({ data }, {
      onSuccess: () => {
        toast({
          title: t('common.success'),
          description: lang === 'ar' ? 'تم تحديث الملف الشخصي بنجاح' : 'Profile updated successfully',
        });
      },
      onError: (err) => {
        toast({
          variant: "destructive",
          title: t('common.error'),
          description: err?.message || 'Failed to update profile',
        });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <Skeleton className="h-10 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Card>
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">{t('settings.title')}</h2>
        <p className="text-muted-foreground mt-1">
          {lang === 'ar' ? 'إدارة إعدادات حسابك وملفك الشخصي' : 'Manage your account settings and profile'}
        </p>
      </div>

      <Card className="shadow-sm border-border/50">
        <CardHeader className="bg-muted/30 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <UserCircle className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-lg">{t('settings.profile')}</CardTitle>
              <CardDescription>{lang === 'ar' ? 'المعلومات الشخصية التي تظهر للمستخدمين الآخرين' : 'Personal information displayed to other users'}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="mb-8 p-4 rounded-lg bg-muted/50 border border-border/50 flex flex-col sm:flex-row gap-4 sm:items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">{t('settings.email')}</p>
              <p className="text-base font-semibold">{user?.email}</p>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">{t('settings.role')}</p>
              <p className="text-base font-semibold capitalize">{user?.role}</p>
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="firstNameAr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('settings.firstNameAr')}</FormLabel>
                      <FormControl>
                        <Input placeholder="الاسم الأول" dir="rtl" {...field} className="bg-muted/30 focus:bg-background transition-colors" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastNameAr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('settings.lastNameAr')}</FormLabel>
                      <FormControl>
                        <Input placeholder="اسم العائلة" dir="rtl" {...field} className="bg-muted/30 focus:bg-background transition-colors" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="firstNameEn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('settings.firstNameEn')}</FormLabel>
                      <FormControl>
                        <Input placeholder="First Name" dir="ltr" {...field} className="bg-muted/30 focus:bg-background transition-colors" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastNameEn"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('settings.lastNameEn')}</FormLabel>
                      <FormControl>
                        <Input placeholder="Last Name" dir="ltr" {...field} className="bg-muted/30 focus:bg-background transition-colors" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end pt-4 border-t border-border/50">
                <Button type="submit" disabled={updateUser.isPending} className="w-full sm:w-auto px-8">
                  {updateUser.isPending ? t('common.loading') : t('settings.save')}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
